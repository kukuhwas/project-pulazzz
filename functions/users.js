// functions/users.js

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
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

// --- FUNGSI SIGNUP & UNDANGAN ---

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
        const signupLink = `http://127.0.0.1:5002/signup.html?ref=${referralCode}`; // Ganti dengan URL produksi saat deploy
        const sgMail = require('@sendgrid/mail');
        sgMail.setApiKey(process.env.SENDGRID_API_KEY);
        const msg = {
            to: inviteeEmail,
            from: 'noreply@lokataraindustry.com', // Pastikan email ini terverifikasi di SendGrid
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
    const { referralCode, password, name, phone, address } = request.data;
    if (!referralCode || !password || !name || !phone || !address) {
        throw new HttpsError('invalid-argument', 'Data pendaftaran tidak lengkap.');
    }
    const invitationRef = db.collection('invitations').doc(referralCode);
    return db.runTransaction(async (transaction) => {
        const invitationDoc = await transaction.get(invitationRef);
        if (!invitationDoc.exists || invitationDoc.data().status !== 'pending') {
            throw new HttpsError('not-found', 'Kode undangan tidak valid atau sudah digunakan.');
        }
        const invitationData = invitationDoc.data();
        const userRecord = await admin.auth().createUser({
            email: invitationData.inviteeEmail,
            password: password,
            displayName: name,
        });
        await admin.auth().setCustomUserClaims(userRecord.uid, {
            role: 'sales',
            representativeId: invitationData.inviterUid
        });
        const profileRef = db.collection('profiles').doc(userRecord.uid);
        transaction.set(profileRef, {
            name: name,
            phone: formatIndonesianPhoneNumber(phone),
            address: address,
            email: invitationData.inviteeEmail,
            role: 'sales',
            referralId: invitationData.inviterUid,
            representativeId: invitationData.inviterUid,
            createdAt: FieldValue.serverTimestamp(),
            accountType: 'user'
        });
        transaction.update(invitationRef, { status: 'completed', completedAt: FieldValue.serverTimestamp() });
        return { success: true, message: 'Pendaftaran berhasil!' };
    });
});

// --- FUNGSI MANAJEMEN PENGGUNA ---

const updateUserProfile = onCall({ region: 'asia-southeast2' }, async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Anda harus login untuk memperbarui profil.');
    }
    const { name, phone, address } = request.data;
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
        await db.runTransaction(async (transaction) => {
            const profileDoc = await transaction.get(profileRef);
            if (!profileDoc.exists) {
                throw new HttpsError('not-found', 'Profil pengguna tidak ditemukan.');
            }
            const oldData = profileDoc.data();
            const oldPhone = oldData.phone;
            if (formattedPhone !== oldPhone) {
                const newPhoneRef = db.collection('phoneNumbers').doc(formattedPhone);
                const phoneDoc = await transaction.get(newPhoneRef);
                if (phoneDoc.exists) {
                    throw new HttpsError('already-exists', 'Nomor telepon baru sudah digunakan oleh profil lain.');
                }
                const oldPhoneRef = db.collection('phoneNumbers').doc(oldPhone);
                transaction.delete(oldPhoneRef);
                transaction.set(newPhoneRef, { profileId: uid });
            }
            const dataToUpdate = { name, phone: formattedPhone, address };
            transaction.update(profileRef, dataToUpdate);
        });
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
    const validRoles = ['sales', 'produksi', 'admin', 'representatif'];
    if (!email || !role || !validRoles.includes(role)) {
        throw new HttpsError('invalid-argument', 'Email atau peran tidak valid.');
    }
    try {
        const user = await admin.auth().getUserByEmail(email);
        const claims = { role: role };
        claims.representativeId = (role === 'sales' && representativeId) ? representativeId : null;

        await admin.auth().setCustomUserClaims(user.uid, claims);
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
    const { email, password, role, representativeId } = request.data;
    const validRoles = ['sales', 'produksi', 'admin', 'representatif'];
    if (!email || !password || !role || !validRoles.includes(role)) {
        throw new HttpsError('invalid-argument', 'Input tidak valid.');
    }
    try {
        const userRecord = await admin.auth().createUser({ email, password });
        const claims = { role: role };
        claims.representativeId = (role === 'sales' && representativeId) ? representativeId : null;

        await admin.auth().setCustomUserClaims(userRecord.uid, claims);
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

const sendPasswordReset = onCall({ region: 'asia-southeast2' }, async (request) => {
    if (request.auth.token.role !== 'admin') {
        throw new HttpsError('permission-denied', 'Hanya admin yang bisa mengirim reset password.');
    }
    const { email } = request.data;
    if (!email) {
        throw new HttpsError('invalid-argument', 'Email wajib diisi.');
    }
    try {
        const link = await admin.auth().generatePasswordResetLink(email);
        console.log(`Link reset password untuk ${email} adalah: ${link}`);
        return { success: true, message: `Link reset password berhasil dikirim ke ${email}.` };
    } catch (error) {
        console.error("Gagal mengirim link reset password:", error);
        if (error.code === 'auth/user-not-found') {
            throw new HttpsError('not-found', 'Pengguna dengan email tersebut tidak ditemukan.');
        }
        throw new HttpsError('internal', 'Gagal mengirim link reset password.');
    }
});

// Ekspor semua fungsi dalam file ini
module.exports = {
    sendInvitation,
    completeSignup,
    updateUserProfile,
    setUserRole,
    listAllUsers,
    createNewUser,
    sendPasswordReset
};