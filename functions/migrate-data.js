// functions/migrate-data.js
const admin = require('firebase-admin');

// Path ke kunci akun layanan Anda, diatur melalui variabel lingkungan
const SOURCE_SERVICE_ACCOUNT_PATH = process.env.SOURCE_KEY_PATH;
const DEST_SERVICE_ACCOUNT_PATH = process.env.DEST_KEY_PATH;

if (!SOURCE_SERVICE_ACCOUNT_PATH || !DEST_SERVICE_ACCOUNT_PATH) {
    console.error('Kesalahan: Harap atur variabel lingkungan SOURCE_KEY_PATH dan DEST_KEY_PATH.');
    console.error('Contoh: export SOURCE_KEY_PATH="/path/to/source.json"');
    process.exit(1);
}

let sourceServiceAccount, destServiceAccount;

try {
    sourceServiceAccount = require(SOURCE_SERVICE_ACCOUNT_PATH);
    destServiceAccount = require(DEST_SERVICE_ACCOUNT_PATH);
} catch (e) {
    console.error('Kesalahan: Tidak dapat memuat file kunci akun layanan. Pastikan path sudah benar.', e.message);
    process.exit(1);
}


// Inisialisasi aplikasi Firebase Admin SDK untuk kedua proyek
const sourceApp = admin.initializeApp({
  credential: admin.credential.cert(sourceServiceAccount)
}, 'source');

const destApp = admin.initializeApp({
  credential: admin.credential.cert(destServiceAccount)
}, 'destination');

const sourceDb = sourceApp.firestore();
const destDb = destApp.firestore();

// Daftar koleksi yang akan disalin
const collectionsToCopy = ['districts', 'cities', 'provinces', 'products'];

/**
 * Menyalin semua dokumen dari satu koleksi di database sumber ke database tujuan.
 * @param {string} collectionName Nama koleksi yang akan disalin.
 */
async function copyCollection(collectionName) {
  console.log(`Memulai penyalinan koleksi: ${collectionName}...`);

  const collectionRef = sourceDb.collection(collectionName);
  const snapshot = await collectionRef.get();

  if (snapshot.empty) {
    console.log(`Koleksi ${collectionName} kosong, dilewati.`);
    return;
  }

  // Menggunakan batched write untuk efisiensi dan untuk menangani hingga 500 operasi sekaligus
  let batch = destDb.batch();
  let i = 0;
  for (const doc of snapshot.docs) {
    const docRef = destDb.collection(collectionName).doc(doc.id);
    batch.set(docRef, doc.data());
    i++;
    // Firestore batch writes memiliki batas 500 operasi.
    // Jika lebih, kita commit batch saat ini dan memulai yang baru.
    if (i % 500 === 0) {
      await batch.commit();
      batch = destDb.batch();
    }
  }
  // Commit sisa dokumen dalam batch terakhir
  if (i % 500 !== 0) {
      await batch.commit();
  }

  console.log(`Berhasil menyalin ${snapshot.size} dokumen ke koleksi ${collectionName}.`);
}

/**
 * Fungsi utama untuk menjalankan proses migrasi.
 */
async function migrateData() {
  console.log('Memulai migrasi data dari produksi ke staging...');
  try {
    for (const collectionName of collectionsToCopy) {
      await copyCollection(collectionName);
    }
    console.log('\nMigrasi data berhasil diselesaikan!');
  } catch (error) {
    console.error('Terjadi kesalahan selama migrasi data:', error);
    process.exit(1);
  }
}

migrateData();
