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

const sendInvitation = onCall({ secrets: ["SENDGRID_API_KEY"] }, async (request) => {
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

        // --- Logika Pemilihan Base URL ---
        let baseUrl;
        const projectId = process.env.GCLOUD_PROJECT;
        const isEmulated = process.env.FUNCTIONS_EMULATOR === 'true';

        if (isEmulated) {
            baseUrl = 'http://127.0.0.1:5002';
        } else if (projectId === 'project-pulazzz-staging') {
            baseUrl = 'https://project-pulazzz-staging.firebaseapp.com';
        } else {
            baseUrl = 'https://project-pulazzz.firebaseapp.com'; // Fallback ke produksi
        }

        const signupLink = `${baseUrl}/signup.html?ref=${referralCode}`;
        const sgMail = require('@sendgrid/mail');
        sgMail.setApiKey(process.env.SENDGRID_API_KEY);
        const msg = {
            to: inviteeEmail,
            from: 'noreply@lokataraindustry.com',
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

const completeSignup = onCall(async (request) => {
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
            role: 'reseller',
            representativeId: invitationData.inviterUid
        });

        const profileRef = db.collection('profiles').doc(userRecord.uid);
        transaction.set(profileRef, {
            name: name,
            phone: formatIndonesianPhoneNumber(phone),
            address: address,
            email: invitationData.inviteeEmail,
            role: 'reseller',
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

const updateUserProfile = onCall(async (request) => {
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

const setUserRole = onCall(async (request) => {
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
        return { success: true, message: `Berhasil menjadikan ${email} sebagai ${role}.` };
    } catch (error) {
        console.error("Gagal mengatur peran:", error);
        throw new HttpsError('internal', 'Gagal mengatur peran pengguna.', error);
    }
});

const listAllUsers = onCall(async (request) => {
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

const createNewUser = onCall(async (request) => {
    if (request.auth.token.role !== 'admin') {
        throw new HttpsError('permission-denied', 'Hanya admin yang bisa membuat pengguna baru.');
    }
    const { email, password, role, representativeId } = request.data;


    const validRoles = ['reseller', 'produksi', 'admin', 'representatif'];
    if (!email || !password || !role || !validRoles.includes(role)) {
        throw new HttpsError('invalid-argument', 'Input tidak valid.');
    }
    try {
        const userRecord = await admin.auth().createUser({ email, password });
        const claims = { role: role };


        claims.representativeId = (role === 'reseller' && representativeId) ? representativeId : null;

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

const sendPasswordReset = onCall(async (request) => {
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

// Tambahkan fungsi ini di dalam functions/users.js

const getInvitationDetails = onCall(async (request) => {
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

module.exports = {
    getInvitationDetails, // Tambahkan ini
    sendInvitation,
    completeSignup,
    updateUserProfile,
    setUserRole,
    listAllUsers,
    createNewUser,
    sendPasswordReset
};