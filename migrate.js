// migrate.js (REVISI)
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const serviceAccount = require('./functions/serviceAccountKey-staging.json');
const PROFILES_COLLECTION = 'profiles';
const PARENT_ID_FIELD = 'referralId'; // <-- KITA UBAH INI

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();
console.log('Berhasil terhubung ke Firestore.');

async function migrateData() {
    console.log(`Membaca semua dokumen dari koleksi '${PROFILES_COLLECTION}'...`);
    const profilesSnapshot = await db.collection(PROFILES_COLLECTION).get();

    if (profilesSnapshot.empty) {
        console.log('Tidak ada dokumen untuk dimigrasi.');
        return;
    }

    const userMap = new Map();
    profilesSnapshot.forEach(doc => {
        userMap.set(doc.id, doc.data());
    });

    console.log(`Ditemukan ${userMap.size} profil pengguna.`);
    console.log('Mulai menghitung silsilah (ancestors) berdasarkan referralId...');

    const updates = [];

    // Fungsi rekursif untuk membangun silsilah berdasarkan referralId
    const getAncestors = (userId, visited = new Set()) => {
        if (visited.has(userId)) {
            console.warn(`Peringatan: Terdeteksi perulangan pada user ID: ${userId}`);
            return [];
        }
        visited.add(userId);

        const user = userMap.get(userId);
        if (!user || !user[PARENT_ID_FIELD]) {
            return [];
        }

        const parentId = user[PARENT_ID_FIELD];
        const parentAncestors = getAncestors(parentId, visited);
        return [...parentAncestors, parentId];
    };

    userMap.forEach((user, uid) => {
        const calculatedAncestors = getAncestors(uid, new Set());

        const existingAncestors = user.ancestors || [];
        if (JSON.stringify(calculatedAncestors) !== JSON.stringify(existingAncestors)) {
            updates.push({ uid, ancestors: calculatedAncestors });
        }
    });

    if (updates.length === 0) {
        console.log('Semua data sudah sinkron. Tidak ada yang perlu diperbarui.');
        return;
    }

    console.log(`${updates.length} profil akan diperbarui.`);

    const batchArray = [];
    let currentBatch = db.batch();
    let operationCount = 0;

    for (const update of updates) {
        const docRef = db.collection(PROFILES_COLLECTION).doc(update.uid);
        currentBatch.update(docRef, { ancestors: update.ancestors });
        operationCount++;

        if (operationCount === 499) {
            batchArray.push(currentBatch);
            currentBatch = db.batch();
            operationCount = 0;
        }
    }

    if (operationCount > 0) {
        batchArray.push(currentBatch);
    }

    console.log(`Memproses pembaruan dalam ${batchArray.length} batch...`);
    await Promise.all(batchArray.map(batch => batch.commit()));

    console.log('Migrasi data selesai! ✅');
}

migrateData().catch(error => {
    console.error('Terjadi kesalahan saat migrasi:', error);
});