// file: functions/seed.js

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Inisialisasi Admin SDK
admin.initializeApp({
    projectId: 'project-pulazzz',
});

const auth = admin.auth();
const db = admin.firestore();

// --- FUNGSI UNTUK MEMBUAT PENGGUNA UJI COBA (SEMUA ROLE) ---
async function createTestUsers() {
    console.log('Memulai pembuatan pengguna untuk pengujian...');

    const testUsers = [
        { email: 'test.admin@example.com', role: 'admin' },
        { email: 'test.sales@example.com', role: 'sales' },
        { email: 'test.produksi@example.com', role: 'produksi' },
        { email: 'test.representatif@example.com', role: 'representatif' },
    ];

    const password = 'poposiroyo';

    for (const userData of testUsers) {
        const { email, role } = userData;
        try {
            // Cek dulu apakah pengguna sudah ada
            await auth.getUserByEmail(email);
            console.warn(`✔️ Pengguna ${email} (${role}) sudah ada.`);
        } catch (error) {
            if (error.code === 'auth/user-not-found') {
                // Jika tidak ada, buat pengguna baru
                const userRecord = await auth.createUser({
                    email: email,
                    password: password,
                    emailVerified: true,
                    displayName: `Test ${role.charAt(0).toUpperCase() + role.slice(1)}`,
                });
                await auth.setCustomUserClaims(userRecord.uid, { role: role });
                console.log(`✅ Berhasil membuat pengguna ${email} dengan peran '${role}'.`);
            } else {
                console.error(`Gagal memeriksa pengguna ${email}:`, error);
            }
        }
    }
}

// --- FUNGSI UNTUK MEMUAT DATA DARI FILE ---
async function seedCollectionFromFile(filePath, collectionName) {
    if (!fs.existsSync(filePath)) {
        console.warn(`⚠️ File tidak ditemukan: ${filePath}. Melewati koleksi '${collectionName}'.`);
        return;
    }

    console.log(`\nMemulai proses seeding untuk koleksi '${collectionName}'...`);
    try {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        if (!Array.isArray(data)) throw new Error("File data harus berupa array of objects.");

        const collectionRef = db.collection(collectionName);
        const batch = db.batch();
        let count = 0;

        data.forEach(item => {
            if (!item.id) {
                console.error(`Item dalam '${collectionName}' tidak memiliki 'id'. Item dilewati:`, item);
                return;
            }
            const docId = item.id;
            const docData = { ...item };
            delete docData.id;

            batch.set(collectionRef.doc(docId), docData);
            count++;
        });

        await batch.commit();
        console.log(`✅ Berhasil memuat ${count} dokumen ke koleksi '${collectionName}'.`);

    } catch (error) {
        console.error(`Gagal memuat data untuk '${collectionName}':`, error.message);
    }
}

// --- FUNGSI UTAMA UNTUK MENJALANKAN SEMUA SEEDING ---
async function main() {
    console.log('Memulai proses seeding...');

    // 1. Buat semua pengguna uji coba
    await createTestUsers();

    // 2. Muat semua koleksi dari file JSON
    await seedCollectionFromFile(path.join(__dirname, 'seed-data/cities.json'), 'cities');
    await seedCollectionFromFile(path.join(__dirname, 'seed-data/districts.json'), 'districts');
    await seedCollectionFromFile(path.join(__dirname, 'seed-data/orderCounters.json'), 'orderCounters');
    await seedCollectionFromFile(path.join(__dirname, 'seed-data/orders.json'), 'orders');
    await seedCollectionFromFile(path.join(__dirname, 'seed-data/products.json'), 'products');
    await seedCollectionFromFile(path.join(__dirname, 'seed-data/provinces.json'), 'provinces');

    console.log('\nSemua proses seeding telah selesai!');
}

main().catch(console.error);
