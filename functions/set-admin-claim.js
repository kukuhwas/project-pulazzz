// functions/set-admin-claim.js
const admin = require('firebase-admin');

// UID dan email pengguna yang akan dijadikan admin
const UID = 'jT6bmCjKTMdwFkbNRFujI2uqKRJ3';
const EMAIL = 'kukuhw@gmail.com';

// Path ke file kunci akun layanan Anda
// Atur variabel lingkungan GOOGLE_APPLICATION_CREDENTIALS
// atau berikan path secara manual.
// Contoh: const serviceAccount = require('/path/to/your/serviceAccountKey.json');
if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.error('Kesalahan: Variabel lingkungan GOOGLE_APPLICATION_CREDENTIALS tidak diatur.');
    console.error('Harap atur variabel ini ke path file kunci akun layanan Firebase Anda.');
    process.exit(1);
}

const serviceAccount = require(process.env.GOOGLE_APPLICATION_CREDENTIALS);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

async function setAdminClaim() {
  try {
    // Verifikasi bahwa pengguna ada
    const userRecord = await admin.auth().getUser(UID);
    if (userRecord.email.toLowerCase() !== EMAIL.toLowerCase()) {
        console.error(`Error: UID ${UID} tidak cocok dengan email ${EMAIL}.`);
        console.error(`Email yang ditemukan untuk UID tersebut adalah: ${userRecord.email}`);
        process.exit(1);
    }

    // Atur custom claim 'admin'
    await admin.auth().setCustomUserClaims(UID, { role: 'admin' });

    console.log(`Berhasil! Pengguna ${EMAIL} (UID: ${UID}) sekarang adalah admin.`);
    console.log('Perubahan akan diterapkan setelah pengguna login kembali.');

  } catch (error) {
    console.error('Gagal mengatur klaim admin:', error);
    process.exit(1);
  }
}

setAdminClaim();
