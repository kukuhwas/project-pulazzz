const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

// Fungsi untuk mengubah ke Title Case (sudah diperbaiki)
function toTitleCase(str) {
    if (!str || typeof str !== 'string') {
        return '';
    }
    return str.toLowerCase().split(' ').map(word => {
        return word.charAt(0).toUpperCase() + word.slice(1);
    }).join(' ');
}

// Inisialisasi Firebase Admin
try {
    const serviceAccount = require("./service-account-key.json");
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
} catch (error) {
    console.error("❌ Gagal inisialisasi. Pastikan 'service-account-key.json' ada di folder 'functions'.");
    process.exit(1);
}

const db = admin.firestore();

// Path ke file JSON Anda
const dataDir = path.join(__dirname, '..', 'data-import');
const filesToImport = [
    { fileName: 'provinces.json', collectionName: 'provinces' },
    { fileName: 'cities.json', collectionName: 'cities', idField: 'province_id', newIdField: 'provinceId' },
    { fileName: 'districts.json', collectionName: 'districts', idField: 'regency_id', newIdField: 'cityId' },
];

async function importData() {
    for (const file of filesToImport) {
        const filePath = path.join(dataDir, file.fileName);
        if (!fs.existsSync(filePath)) {
            console.warn(`⚠️ File tidak ditemukan: ${filePath}. Melewati...`);
            continue;
        }

        const collectionRef = db.collection(file.collectionName);
        console.log(`Mengimpor ${file.fileName} ke koleksi ${file.collectionName}...`);

        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));


        const batchArray = [];
        batchArray.push(db.batch());
        let operationCounter = 0;
        let batchIndex = 0;

        for (const item of data) {
            const docId = String(item.id);
            const docData = {
                id: String(item.id),
                // PASTIKAN BARIS INI BENAR
                name: toTitleCase(item.name)
            };

            if (file.idField) {
                docData[file.newIdField] = String(item[file.idField]);
            }

            const docRef = collectionRef.doc(docId);
            batchArray[batchIndex].set(docRef, docData);
            operationCounter++;

            if (operationCounter === 499) {
                batchArray.push(db.batch());
                batchIndex++;
                operationCounter = 0;
            }
        }

        await Promise.all(batchArray.map(batch => batch.commit()));
        console.log(`✅ Selesai mengimpor ${data.length} dokumen dari ${file.fileName}.`);
    }
}

console.log('Memulai proses impor...');
importData().then(() => {
    console.log('🎉 Semua data berhasil diimpor!');
    process.exit(0);
}).catch(error => {
    console.error('❌ Terjadi error saat impor:', error);
    process.exit(1);
});