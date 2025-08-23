// functions/users.js

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

const db = getFirestore();

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

const completeSignup = onCall({ region: 'asia-southeast2' }, async (request) => {
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

    // Logika baru untuk mencari kepala representatif secara berantai
    const inviterUser = await admin.auth().getUser(invitationData.inviterUid);
    const inviterClaims = inviterUser.customClaims || {};
    let headRepresentativeId = null;

    if (inviterClaims.role === 'representatif') {
        headRepresentativeId = invitationData.inviterUid;
    } else if (inviterClaims.role === 'reseller' && inviterClaims.representativeId) {
        headRepresentativeId = inviterClaims.representativeId;
    }

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
                address: address,
                district: district,
                city: city,
                province: province,
                email: invitationData.inviteeEmail,
                role: 'reseller',
                referralId: invitationData.inviterUid,
                representativeId: headRepresentativeId,
                createdAt: FieldValue.serverTimestamp(),
                accountType: 'user'
            });

            transaction.update(invitationRef, { status: 'completed', completedAt: FieldValue.serverTimestamp() });
        });
    } catch (error) {
        await admin.auth().deleteUser(userRecord.uid).catch((deleteError) => {
            console.error("Gagal menghapus pengguna setelah kegagalan transaksi:", deleteError);
        });
        if (error instanceof HttpsError) { throw error; }
        throw new HttpsError('internal', 'Gagal memproses pendaftaran.');
    }

    return { success: true, message: 'Pendaftaran berhasil!' };
});

const updateUserProfile = onCall({ region: 'asia-southeast2' }, async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Anda harus login untuk memperbarui profil.');
    }
    const { name, phone, address, district, city, province } = request.data;
    const uid = request.auth.uid;
    if (!name || !phone || !address) {
        throw new HttpsError('invalid-argument', 'Nama, telepon, dan alamat tidak boleh kosong.');
    }
    const formattedPhone = formatIndonesianPhoneNumber(phone);
    if (!formattedPhone) {
        throw new HttpsError('invalid-argument', 'Nomor telepon tidak valid.');
    }
    const profileRef = db.collection('profiles').doc(uid);
    try {
        const dataToUpdate = { name, phone: formattedPhone, address, district, city, province };
        await profileRef.update(dataToUpdate);
        return { success: true, message: 'Profil berhasil diperbarui.' };
    } catch (error) {
        console.error("Gagal memperbarui profil:", error);
        if (error instanceof HttpsError) { throw error; }
        throw new HttpsError('internal', 'Gagal memperbarui profil.');
    }
});

const setUserRole = onCall({ region: 'asia-southeast2' }, async (request) => {
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
        await profileRef.update({ role: role, representativeId: claims.representativeId });

        return { success: true, message: `Berhasil menjadikan ${email} sebagai ${role}.` };
    } catch (error) {
        console.error("Gagal mengatur peran:", error);
        throw new HttpsError('internal', 'Gagal mengatur peran pengguna.', error);
    }
});

const listAllUsers = onCall({ region: 'asia-southeast2' }, async (request) => {
    if (request.auth.token.role !== 'admin') {
        throw new HttpsError('permission-denied', 'Hanya admin yang bisa melihat daftar pengguna.');
    }
    try {
        const userRecords = await admin.auth().listUsers();
        return userRecords.users.map(user => ({
            uid: user.uid,
            email: user.email,
            role: user.customClaims?.role || 'N/A',
            representativeId: user.customClaims?.representativeId || null,
        }));
    } catch (error) {
        console.error("Gagal mengambil daftar pengguna:", error);
        throw new HttpsError('internal', 'Gagal mengambil daftar pengguna.');
    }
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

        const profileRef = db.collection('profiles').doc(userRecord.uid);
        await profileRef.set({
            name: name,
            email: email,
            role: role,
            representativeId: claims.representativeId,
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
    createNewUser,
    deleteUserAndProfile
};
