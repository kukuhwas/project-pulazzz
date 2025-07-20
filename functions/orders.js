// functions/orders.js

const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

const db = getFirestore();

// --- FUNGSI HELPER YANG DIPERBARUI ---
function formatIndonesianPhoneNumber(phoneNumber) {
    if (!phoneNumber || typeof phoneNumber !== 'string') return null;

    let cleaned = phoneNumber.replace(/\D/g, '');

    if (cleaned.startsWith('62')) {
        // Sudah benar
    } else if (cleaned.startsWith('0')) {
        cleaned = '62' + cleaned.substring(1);
    } else if (cleaned.startsWith('8')) { // MENANGANI KASUS INI
        cleaned = '62' + cleaned;
    } else {
        return null;
    }

    // Validasi panjang (11 s/d 15 digit totalnya)
    if (cleaned.length >= 11 && cleaned.length <= 15) {
        return cleaned;
    }

    return null;
}

// --- FUNGSI TERKAIT PESANAN ---

const createOrderAndProfile = onCall({ region: 'asia-southeast2' }, async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Anda harus login untuk membuat pesanan.');
    }

    const { customerInfo, shippingAddress, items, paymentMethod } = request.data;
    const creator = { uid: request.auth.uid, email: request.auth.token.email };

    // Memanggil fungsi helper yang sudah diperbarui
    const formattedPhone = formatIndonesianPhoneNumber(customerInfo.phone);
    if (!formattedPhone) {
        throw new HttpsError('invalid-argument', 'Nomor telepon tidak valid.');
    }

    const totalAmount = items.reduce((total, item) => total + (item.priceAtPurchase * item.quantity), 0);

    const claims = request.auth.token;
    let representativeIdForOrder = null;
    if (claims.role === 'representatif') {
        representativeIdForOrder = creator.uid;
    } else if (claims.role === 'sales' && claims.representativeId) {
        representativeIdForOrder = claims.representativeId;
    }

    try {
        let orderIdToReturn = null;

        await db.runTransaction(async (transaction) => {
            const phoneRef = db.collection('phoneNumbers').doc(formattedPhone);
            const profilesQuery = db.collection('profiles').where('phone', '==', formattedPhone).limit(1);

            const existingProfiles = await transaction.get(profilesQuery);
            let profileId;

            if (existingProfiles.empty) {
                const phoneDoc = await transaction.get(phoneRef);
                if (phoneDoc.exists) {
                    throw new HttpsError('already-exists', 'Nomor telepon sudah terdaftar dengan profil lain.');
                }

                const newProfileRef = db.collection('profiles').doc();
                profileId = newProfileRef.id;

                const newProfileData = {
                    name: customerInfo.name,
                    phone: formattedPhone,
                    address: shippingAddress.fullAddress,
                    representativeId: representativeIdForOrder,
                    createdAt: FieldValue.serverTimestamp()
                };

                transaction.set(newProfileRef, newProfileData);
                transaction.set(phoneRef, { profileId: profileId });

            } else {
                const profileDoc = existingProfiles.docs[0];
                profileId = profileDoc.id;
                const existingProfileRef = profileDoc.ref;

                const profileDataToUpdate = {};
                if (profileDoc.data().name !== customerInfo.name) {
                    profileDataToUpdate.name = customerInfo.name;
                }
                if (profileDoc.data().address !== shippingAddress.fullAddress) {
                    profileDataToUpdate.address = shippingAddress.fullAddress;
                }

                if (Object.keys(profileDataToUpdate).length > 0) {
                    transaction.update(existingProfileRef, profileDataToUpdate);
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
        transaction.update(orderRef, {
            displayId: displayId
        });

        console.log(`Generated displayId: ${displayId} for order: ${event.params.orderId}`);
        return displayId;
    });
});

module.exports = {
    createOrderAndProfile,
    generateDisplayId
};