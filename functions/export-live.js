// file: functions/export-live.js
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// --- KONFIGURASI ---
// Arahkan ke file kunci service account Anda
const serviceAccount = require('./service-account-key.json');

// Daftar koleksi yang ingin diekspor dari proyek LIVE
const collectionsToExport = ['cities', 'districts', 'orders', 'products', 'provinces', 'orderCounters'];

// Inisialisasi Admin SDK untuk terhubung ke proyek LIVE
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const outputDir = path.join(__dirname, 'seed-data');

// Pastikan folder output ada
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
}

async function exportCollection(collectionName) {
    console.log(`Mengekspor koleksi '${collectionName}'...`);
    try {
        const snapshot = await db.collection(collectionName).get();
        const documents = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        const outputFile = path.join(outputDir, `${collectionName}.json`);
        fs.writeFileSync(outputFile, JSON.stringify(documents, null, 2));
        console.log(`✅ Berhasil menyimpan ${documents.length} dokumen ke ${outputFile}`);
    } catch (error) {
        console.error(`Gagal mengekspor koleksi '${collectionName}':`, error);
    }
}

async function main() {
    console.log('Memulai ekspor dari proyek LIVE...');
    for (const collectionName of collectionsToExport) {
        await exportCollection(collectionName);
    }
    console.log('\nEkspor selesai!');
}

main();
