// functions/users.js (Versi Final Terupdate)

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

const db = getFirestore();

// --- FUNGSI PEMBANTU ---

/**
 * Fungsi ini secara rekursif mencari silsilah berdasarkan referralId ("Orang Tua").
 * @param {string} docId - ID dokumen profil yang akan ditelusuri.
 * @param {Set<string>} visited - Set untuk melacak ID yang sudah dikunjungi untuk mencegah perulangan tak terbatas.
 * @returns {Promise<string[]>} - Sebuah array berisi ID para leluhur.
 */
async function getAncestorsByReferral(docId, visited = new Set()) {
    if (!docId || visited.has(docId)) {
        if (visited.has(docId)) console.warn(`Deteksi perulangan silsilah pada ID: ${docId}`);
        return [];
    }
    visited.add(docId);

    const profileDoc = await db.collection('profiles').doc(docId).get();
    if (!profileDoc.exists) return [];

    const parentId = profileDoc.data().referralId;
    if (!parentId) return [];

    const parentAncestors = await getAncestorsByReferral(parentId, visited);
    return [...parentAncestors, parentId];
}

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

// --- FUNGSI UTAMA ---
const getInvitationDetails = onCall({ region: 'asia-southeast2' }, async (request) => {
    const { referralCode } = request.data;
    if (!referralCode) {
        throw new HttpsError('invalid-argument', 'Kode undangan tidak disediakan.');
    }
    const invitationRef = db.collection('invitations').doc(referralCode);
    const invitationDoc = await invitationRef.get();
    if (!invitationDoc.exists || invitationDoc.data().status !== 'pending') {
        throw new HttpsError('not-found', 'Kode undangan tidak valid atau sudah digunakan.');
    }
    return {
        email: invitationDoc.data().inviteeEmail
    };
});

const sendInvitation = onCall({ region: 'asia-southeast2', secrets: ["SENDGRID_API_KEY"] }, async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Anda harus login untuk mengirim undangan.');
    }
    const { inviteeEmail } = request.data;
    if (!inviteeEmail) {
        throw new HttpsError('invalid-argument', 'Email calon pengguna wajib diisi.');
    }
    const inviter = { uid: request.auth.uid, email: request.auth.token.email };
    try {
        const invitationRef = await db.collection('invitations').add({
            inviterUid: inviter.uid,
            inviterEmail: inviter.email,
            inviteeEmail: inviteeEmail,
            status: 'pending',
            createdAt: FieldValue.serverTimestamp()
        });
        const referralCode = invitationRef.id;
        const baseUrl = process.env.APP_URL || 'http://127.0.0.1:5002';
        const signupLink = `${baseUrl}/signup.html?ref=${referralCode}`;
        const sgMail = require('@sendgrid/mail');
        sgMail.setApiKey(process.env.SENDGRID_API_KEY);
        const msg = {
            to: inviteeEmail,
            from: 'noreply@lokataraindustry.com', // Ganti dengan email pengirim Anda
            subject: `Anda Diundang untuk Bergabung dengan Sistem Order Pulazzz`,
            html: `<p>Anda telah diundang oleh <strong>${inviter.email}</strong> untuk bergabung. Silakan klik link di bawah untuk mendaftar:</p><a href="${signupLink}">Selesaikan Pendaftaran</a>`,
        };
        await sgMail.send(msg);
        return { success: true, message: `Undangan berhasil dikirim ke ${inviteeEmail}.` };
    } catch (error) {
        console.error("Gagal mengirim undangan:", error);
        throw new HttpsError('internal', 'Gagal memproses undangan.');
    }
});

const completeSignup = onCall({ cors: true, region: 'asia-southeast2' }, async (request) => {
    const { referralCode, password, name, phone, address, district, city, province } = request.data;
    if (!referralCode || !password || !name || !phone || !address || !district || !city || !province) {
        throw new HttpsError('invalid-argument', 'Data pendaftaran tidak lengkap.');
    }

    const invitationRef = db.collection('invitations').doc(referralCode);
    const invitationDoc = await invitationRef.get();
    if (!invitationDoc.exists || invitationDoc.data().status !== 'pending') {
        throw new HttpsError('not-found', 'Kode undangan tidak valid atau sudah digunakan.');
    }
    const invitationData = invitationDoc.data();
    const inviterId = invitationData.inviterUid;

    // 1. Logika untuk mencari 'Guru' (representativeId) dari "Orang Tua" langsung
    const inviterProfileDoc = await db.collection('profiles').doc(inviterId).get();
    let headRepresentativeId = null;
    if (inviterProfileDoc.exists) {
        const inviterProfile = inviterProfileDoc.data();
        if (inviterProfile.role === 'representatif') {
            headRepresentativeId = inviterId;
        } else if (inviterProfile.role === 'reseller' && inviterProfile.representativeId) {
            headRepresentativeId = inviterProfile.representativeId;
        }
    }

    // 2. Logika untuk mencari silsilah 'Orang Tua' (ancestors) berdasarkan referralId
    const parentAncestors = await getAncestorsByReferral(inviterId, new Set());
    const newAncestors = [...parentAncestors, inviterId];

    let userRecord;
    try {
        userRecord = await admin.auth().createUser({
            email: invitationData.inviteeEmail,
            password: password,
            displayName: name,
        });
        await admin.auth().setCustomUserClaims(userRecord.uid, {
            role: 'reseller',
            representativeId: headRepresentativeId
        });
    } catch (error) {
        console.error("Gagal membuat pengguna baru:", error);
        throw new HttpsError('internal', 'Gagal membuat pengguna baru.');
    }

    try {
        await db.runTransaction(async (transaction) => {
            const latestInvitation = await transaction.get(invitationRef);
            if (!latestInvitation.exists || latestInvitation.data().status !== 'pending') {
                throw new HttpsError('not-found', 'Kode undangan tidak valid atau sudah digunakan.');
            }

            const profileRef = db.collection('profiles').doc(userRecord.uid);
            transaction.set(profileRef, {
                name: name,
                phone: formatIndonesianPhoneNumber(phone),
                address, district, city, province,
                email: invitationData.inviteeEmail,
                role: 'reseller',
                referralId: inviterId,
                representativeId: headRepresentativeId,
                ancestors: newAncestors,
                createdAt: FieldValue.serverTimestamp(),
                accountType: 'user'
            });
            transaction.update(invitationRef, { status: 'completed', completedAt: FieldValue.serverTimestamp() });
        });
    } catch (error) {
        await admin.auth().deleteUser(userRecord.uid).catch(console.error);
        if (error instanceof HttpsError) { throw error; }
        throw new HttpsError('internal', 'Gagal memproses pendaftaran.');
    }

    return { success: true, message: 'Pendaftaran berhasil!' };
});

const updateUserProfile = onCall({ cors: true, region: 'asia-southeast2' }, async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Anda harus login untuk memperbarui profil.');
    }
    // Ambil hanya data yang diizinkan dari request
    const { name, phone, address, district, city, province } = request.data;
    const uid = request.auth.uid;

    if (!name || !phone || !address) {
        throw new HttpsError('invalid-argument', 'Nama, telepon, dan alamat tidak boleh kosong.');
    }
    const formattedPhone = formatIndonesianPhoneNumber(phone);
    if (!formattedPhone) {
        throw new HttpsError('invalid-argument', 'Nomor telepon tidak valid.');
    }

    // Buat objek yang hanya berisi field yang boleh diubah pengguna
    const dataToUpdate = {
        name,
        phone: formattedPhone,
        address,
        district,
        city,
        province
    };

    const profileRef = db.collection('profiles').doc(uid);
    try {
        await profileRef.update(dataToUpdate);
        return { success: true, message: 'Profil berhasil diperbarui.' };
    } catch (error) {
        console.error("Gagal memperbarui profil:", error);
        if (error instanceof HttpsError) { throw error; }
        throw new HttpsError('internal', 'Gagal memperbarui profil.');
    }
});

const setUserRole = onCall({ cors: true, region: 'asia-southeast2' }, async (request) => {
    if (request.auth.token.role !== 'admin') {
        throw new HttpsError('permission-denied', 'Hanya admin yang bisa mengubah peran pengguna.');
    }
    const { email, role, representativeId } = request.data;
    const validRoles = ['reseller', 'produksi', 'admin', 'representatif'];
    if (!email || !role || !validRoles.includes(role)) {
        throw new HttpsError('invalid-argument', 'Email atau peran tidak valid.');
    }
    try {
        const user = await admin.auth().getUserByEmail(email);
        const claims = { role: role };
        claims.representativeId = (role === 'reseller' && representativeId) ? representativeId : null;
        await admin.auth().setCustomUserClaims(user.uid, claims);

        const profileRef = db.collection('profiles').doc(user.uid);
        // Silsilah (ancestors) tidak diubah di sini karena berdasarkan referralId yang tetap.
        await profileRef.update({ role: role, representativeId: claims.representativeId });

        return { success: true, message: `Berhasil menjadikan ${email} sebagai ${role}.` };
    } catch (error) {
        console.error("Gagal mengatur peran:", error);
        throw new HttpsError('internal', 'Gagal mengatur peran pengguna.', error);
    }
});

const listAllUsers = onCall({
    cors: true,
    region: 'asia-southeast2'
}, async (request) => {
    const userRole = request.auth.token.role;
    const userId = request.auth.uid;

    if (userRole !== 'admin' && userRole !== 'representatif') {
        throw new HttpsError('permission-denied', 'Hanya admin atau representatif yang bisa melihat daftar pengguna.');
    }

    try {
        let profilesQuery;

        if (userRole === 'admin') {
            // Admin: Ambil semua profil
            profilesQuery = db.collection('profiles');
        } else { // userRole === 'representatif'
            // Representatif: Ambil dirinya sendiri DAN semua yang punya dia di silsilahnya
            profilesQuery = db.collection('profiles')
                .where('ancestors', 'array-contains', userId);

            // Catatan: Query di atas tidak akan mengembalikan data representatif itu sendiri.
            // Kita akan mengambilnya secara terpisah dan menggabungkannya.
        }

        const profilesSnapshot = await profilesQuery.get();
        const profilesMap = new Map();
        profilesSnapshot.forEach(doc => {
            profilesMap.set(doc.id, doc.data());
        });

        // Jika representatif, tambahkan data dirinya sendiri ke dalam map
        if (userRole === 'representatif') {
            const selfProfileDoc = await db.collection('profiles').doc(userId).get();
            if (selfProfileDoc.exists) {
                profilesMap.set(userId, selfProfileDoc.data());
            }
        }

        // Ambil data dari Auth HANYA untuk profil yang relevan
        // Ini lebih efisien daripada listUsers() penuh untuk representatif
        const uidsToFetch = Array.from(profilesMap.keys());
        if (uidsToFetch.length === 0) {
            return []; // Kembalikan array kosong jika tidak ada pengguna
        }

        const authUsers = await admin.auth().getUsers(uidsToFetch.map(uid => ({ uid })));

        const allUsersData = authUsers.users.map(userRecord => {
            const profile = profilesMap.get(userRecord.uid) || {};
            return {
                uid: userRecord.uid,
                email: userRecord.email,
                name: profile.name || userRecord.displayName,
                role: profile.role || 'N/A',
                referralId: profile.referralId || null,
                representativeId: profile.representativeId || null,
                ancestors: profile.ancestors || []
            };
        });

        return allUsersData;

    } catch (error) {
        console.error("Gagal mengambil daftar pengguna:", error);
        throw new HttpsError('internal', 'Gagal mengambil daftar pengguna.');
    }
});

const getUserProfile = onCall({ cors: true, region: 'asia-southeast2' }, async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Anda harus login untuk melihat profil.');
    }
    const uid = request.auth.uid;
    const profileRef = db.collection('profiles').doc(uid);
    const profileDoc = await profileRef.get();

    if (!profileDoc.exists) {
        throw new HttpsError('not-found', 'Profil tidak ditemukan.');
    }

    const userProfile = profileDoc.data();

    // Ambil nama pereferensi ("Orang Tua") jika ada
    if (userProfile.referralId) {
        const referrerProfileRef = db.collection('profiles').doc(userProfile.referralId);
        const referrerProfileDoc = await referrerProfileRef.get();
        if (referrerProfileDoc.exists) {
            userProfile.referrerName = referrerProfileDoc.data().name || referrerProfileDoc.data().email;
        } else {
            userProfile.referrerName = 'Pengguna tidak ditemukan';
        }
    }

    // Ambil nama representatif ("Guru") jika ada
    if (userProfile.representativeId) {
        const repProfileRef = db.collection('profiles').doc(userProfile.representativeId);
        const repProfileDoc = await repProfileRef.get();
        if (repProfileDoc.exists) {
            userProfile.representativeName = repProfileDoc.data().name || repProfileDoc.data().email;
        } else {
            userProfile.representativeName = 'Pengguna tidak ditemukan';
        }
    }

    return userProfile;
});

const createNewUser = onCall({ region: 'asia-southeast2' }, async (request) => {
    if (request.auth.token.role !== 'admin') {
        throw new HttpsError('permission-denied', 'Hanya admin yang bisa membuat pengguna baru.');
    }
    const { email, password, role, representativeId, name } = request.data;
    const validRoles = ['reseller', 'produksi', 'admin', 'representatif'];
    if (!email || !password || !role || !validRoles.includes(role) || !name) {
        throw new HttpsError('invalid-argument', 'Input tidak valid.');
    }
    try {
        const userRecord = await admin.auth().createUser({ email, password, displayName: name });
        const claims = { role: role };
        claims.representativeId = (role === 'reseller' && representativeId) ? representativeId : null;
        await admin.auth().setCustomUserClaims(userRecord.uid, claims);

        let ancestors = [];
        if (claims.representativeId) {
            const repProfile = await db.collection('profiles').doc(claims.representativeId).get();
            const repAncestors = repProfile.exists ? (repProfile.data().ancestors || []) : [];
            ancestors = [...repAncestors, claims.representativeId];
        }

        const profileRef = db.collection('profiles').doc(userRecord.uid);
        await profileRef.set({
            name: name,
            email: email,
            role: role,
            representativeId: claims.representativeId,
            ancestors: ancestors,
            createdAt: FieldValue.serverTimestamp(),
            accountType: 'user'
        });

        return { success: true, message: `Berhasil membuat pengguna ${email} dengan peran ${role}.` };
    } catch (error) {
        console.error("Gagal membuat pengguna baru:", error);
        if (error.code === 'auth/email-already-exists') {
            throw new HttpsError('already-exists', 'Email sudah terdaftar.');
        }
        if (error.code === 'auth/invalid-password') {
            throw new HttpsError('invalid-argument', 'Password tidak valid. Harus terdiri dari minimal 6 karakter.');
        }
        throw new HttpsError('internal', 'Gagal membuat pengguna baru.');
    }
});

const deleteUserAndProfile = onCall({ region: 'asia-southeast2' }, async (request) => {
    if (request.auth.token.role !== 'admin') {
        throw new HttpsError('permission-denied', 'Hanya admin yang bisa menghapus pengguna.');
    }
    const { uid, email } = request.data;
    if (!uid) {
        throw new HttpsError('invalid-argument', 'UID pengguna wajib diisi.');
    }
    try {
        await admin.auth().deleteUser(uid);
        const profileRef = db.collection('profiles').doc(uid);
        await profileRef.delete();
        return { success: true, message: `Pengguna ${email} berhasil dihapus.` };
    } catch (error) {
        console.error("Gagal menghapus pengguna:", error);
        if (error.code === 'auth/user-not-found') {
            throw new HttpsError('not-found', 'Pengguna tidak ditemukan di Authentication.');
        }
        throw new HttpsError('internal', 'Gagal menghapus pengguna.');
    }
});


module.exports = {
    getInvitationDetails,
    sendInvitation,
    completeSignup,
    updateUserProfile,
    setUserRole,
    listAllUsers,
    getUserProfile,
    createNewUser,
    deleteUserAndProfile
};
