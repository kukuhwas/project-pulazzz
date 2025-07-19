// functions/set-admin.js
const admin = require("firebase-admin");
const serviceAccount = require("./service-account-key.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

// GANTI DENGAN EMAIL ANDA YANG SUDAH DIDAFTARKAN DI FIREBASE AUTH
const emailToMakeAdmin = "nina.waskito@gmail.com";

async function setAdminClaim() {
  try {
    const user = await admin.auth().getUserByEmail(emailToMakeAdmin);
    await admin.auth().setCustomUserClaims(user.uid, { role: 'admin' });
    console.log(`✅ Berhasil menjadikan ${emailToMakeAdmin} sebagai admin.`);
  } catch (error) {
    console.error("❌ Gagal menjadikan admin:", error);
  }
  process.exit();
}

setAdminClaim();