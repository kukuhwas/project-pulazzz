// functions/orders.js

const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

const db = getFirestore();

// --- FUNGSI HELPER ---
function formatIndonesianPhoneNumber(phoneNumber) {
    if (!phoneNumber || typeof phoneNumber !== 'string') return null;
    let cleaned = phoneNumber.replace(/\D/g, '');
    if (cleaned.startsWith('62')) { }
    else if (cleaned.startsWith('0')) { cleaned = '62' + cleaned.substring(1); }
    else if (cleaned.startsWith('8')) { cleaned = '62' + cleaned; }
    else { return null; }
    if (cleaned.length >= 11 && cleaned.length <= 15) { return cleaned; }
    return null;
}

// --- FUNGSI PENDUKUNG ---
const findProfileByPhone = onCall({ region: 'asia-southeast2' }, async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Anda harus login.');
    }
    const { phone } = request.data;
    const formattedPhone = formatIndonesianPhoneNumber(phone);
    if (!formattedPhone) {
        return null;
    }

    const profilesQuery = db.collection('profiles').where('phone', '==', formattedPhone).limit(1);
    const snapshot = await profilesQuery.get();

    if (snapshot.empty) {
        return null;
    }

    const profileData = snapshot.docs[0].data();
    return {
        profileId: snapshot.docs[0].id,
        name: profileData.name,
        address: profileData.address
    };
});


// --- FUNGSI UTAMA PESANAN ---

const createOrderAndProfile = onCall({ region: 'asia-southeast2' }, async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Anda harus login untuk membuat pesanan.');
    }

    const { customerInfo, shippingAddress, items, paymentMethod, updateProfile } = request.data;
    const creator = { uid: request.auth.uid, email: request.auth.token.email };

    const formattedPhone = formatIndonesianPhoneNumber(customerInfo.phone);
    if (!formattedPhone) {
        throw new HttpsError('invalid-argument', 'Nomor telepon tidak valid.');
    }

    const totalAmount = items.reduce((total, item) => total + (item.subtotal || 0), 0);

    const claims = request.auth.token;
    let representativeIdForOrder = null;
    if (claims.role === 'representatif') {
        representativeIdForOrder = creator.uid;
    } else if (claims.role === 'reseller' && claims.representativeId) {
        representativeIdForOrder = claims.representativeId;
    }

    try {
        let orderIdToReturn = null;
        await db.runTransaction(async (transaction) => {
            const profilesQuery = db.collection('profiles').where('phone', '==', formattedPhone).limit(1);
            const existingProfiles = await transaction.get(profilesQuery);
            let profileId;

            if (existingProfiles.empty) {
                // Pelanggan baru, buat profil baru
                const newProfileRef = db.collection('profiles').doc();
                profileId = newProfileRef.id;

                const newProfileData = {
                    name: customerInfo.name,
                    phone: formattedPhone,
                    address: shippingAddress.fullAddress,
                    district: shippingAddress.district,
                    city: shippingAddress.city,
                    province: shippingAddress.province,
                    representativeId: representativeIdForOrder,
                    createdAt: FieldValue.serverTimestamp(),
                    accountType: 'customer'
                };
                transaction.set(newProfileRef, newProfileData);
            } else {
                // Pelanggan lama ditemukan
                const profileDoc = existingProfiles.docs[0];
                profileId = profileDoc.id;

                if (updateProfile) {
                    const profileDataToUpdate = {
                        name: customerInfo.name,
                        address: shippingAddress.fullAddress,
                        district: shippingAddress.district,
                        city: shippingAddress.city,
                        province: shippingAddress.province,
                    };
                    transaction.update(profileDoc.ref, profileDataToUpdate);
                }
            }

            const newOrderRef = db.collection('orders').doc();
            orderIdToReturn = newOrderRef.id;

            const orderData = {
                creator,
                profileId,
                customerInfo: { ...customerInfo, phone: formattedPhone },
                shippingAddress,
                items,
                paymentMethod,
                totalAmount,
                status: 'new_order',
                representativeId: representativeIdForOrder,
                createdAt: FieldValue.serverTimestamp()
            };
            transaction.set(newOrderRef, orderData);
        });

        return { success: true, orderId: orderIdToReturn };

    } catch (error) {
        console.error("Gagal membuat pesanan:", error);
        if (error instanceof HttpsError) {
            throw error;
        }
        throw new HttpsError('internal', 'Terjadi kesalahan internal saat membuat pesanan.');
    }
});

const generateDisplayId = onDocumentCreated({ region: 'asia-southeast2', document: "orders/{orderId}" }, async (event) => {
    const orderRef = event.data.ref;
    const now = new Date();
    const timeZone = 'Asia/Jakarta';
    const options = { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' };
    const formatter = new Intl.DateTimeFormat('sv-SE', options);
    const counterId = formatter.format(now);

    const [yyyy, mm, dd] = counterId.split('-');
    const displayDate = `${yyyy.slice(-2)}${mm}${dd}`;

    const counterRef = db.collection('orderCounters').doc(counterId);

    return db.runTransaction(async (transaction) => {
        const counterDoc = await transaction.get(counterRef);
        let newCount = 1;
        if (counterDoc.exists) {
            newCount = counterDoc.data().count + 1;
        }
        const formattedCount = String(newCount).padStart(3, '0');
        const displayId = `PO-${displayDate}-${formattedCount}`;
        transaction.set(counterRef, { count: newCount });
        transaction.update(orderRef, { displayId: displayId });
        return displayId;
    });
});

const deleteCancelledOrder = onCall({ region: 'asia-southeast2' }, async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Anda harus login untuk melakukan tindakan ini.');
    }
    const { role } = request.auth.token;
    if (role !== 'admin') {
        throw new HttpsError('permission-denied', 'Hanya admin yang dapat menghapus pesanan.');
    }

    const { orderId } = request.data;
    if (!orderId) {
        throw new HttpsError('invalid-argument', 'ID Pesanan tidak valid.');
    }

    const orderRef = db.collection('orders').doc(orderId);

    try {
        const orderDoc = await orderRef.get();
        if (!orderDoc.exists) {
            throw new HttpsError('not-found', 'Pesanan tidak ditemukan.');
        }

        const orderData = orderDoc.data();
        if (orderData.status !== 'cancelled') {
            throw new HttpsError('failed-precondition', 'Hanya pesanan dengan status "Dibatalkan" yang bisa dihapus.');
        }

        await orderRef.delete();

        return { success: true, message: `Pesanan ${orderData.displayId || orderId} berhasil dihapus.` };
    } catch (error) {
        console.error(`Gagal menghapus pesanan ${orderId}:`, error);
        if (error instanceof HttpsError) {
            throw error;
        }
        throw new HttpsError('internal', 'Terjadi kesalahan saat mencoba menghapus pesanan.');
    }
});

module.exports = {
    findProfileByPhone,
    createOrderAndProfile,
    generateDisplayId,
    deleteCancelledOrder
};