/**
 * Skrip untuk melakukan seeding pengguna ke database Firebase.
 *
 * CARA PENGGUNAAN:
 * 1. Pastikan Anda telah mengunduh file kunci akun layanan (service account key) dari
 *    konsol Firebase untuk proyek target Anda (misalnya, staging).
 * 2. Atur variabel lingkungan GOOGLE_APPLICATION_CREDENTIALS ke path file kunci tersebut.
 *    Contoh (Linux/macOS):
 *    export GOOGLE_APPLICATION_CREDENTIALS="/path/to/your/serviceAccountKey.json"
 *    Contoh (Windows PowerShell):
 *    $env:GOOGLE_APPLICATION_CREDENTIALS="/path/to/your/serviceAccountKey.json"
 * 3. Jalankan skrip ini dari direktori 'functions' menggunakan node:
 *    node seed-staging-users.js
 */

const admin = require('firebase-admin');
const { faker } = require('@faker-js/faker');

// --- Konfigurasi ---
const TOTAL_REPRESENTATIVES = 3;
const RESELLERS_PER_REPRESENTATIVE = 2;
const ADDITIONAL_RESELLERS = 16;
const PASSWORD = 'password123';
// --------------------

// Periksa apakah kredensial telah diatur
if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.error('KESALAHAN: Variabel lingkungan GOOGLE_APPLICATION_CREDENTIALS tidak diatur.');
    console.error('Harap atur variabel ini ke path file kunci akun layanan Firebase Anda.');
    process.exit(1);
}

// Inisialisasi Firebase Admin SDK
admin.initializeApp({
    credential: admin.credential.applicationDefault(),
});

const auth = admin.auth();
const db = admin.firestore();

console.log('Memulai proses seeding pengguna...');

// Fungsi untuk membuat pengguna di Auth dan profil di Firestore
async function createUser(userData, claims = {}) {
    try {
        // Buat pengguna di Firebase Authentication
        const userRecord = await auth.createUser({
            email: userData.email,
            password: PASSWORD,
            displayName: userData.name,
        });

        console.log(`- Berhasil membuat pengguna Auth untuk: ${userData.email} (UID: ${userRecord.uid})`);

        // Atur custom claims untuk peran
        await auth.setCustomUserClaims(userRecord.uid, claims);

        // Buat profil pengguna di Firestore
        const profileRef = db.collection('profiles').doc(userRecord.uid);
        await profileRef.set({
            ...userData,
            role: claims.role,
            representativeId: claims.representativeId || null,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        console.log(`- Berhasil membuat profil Firestore untuk: ${userData.email}`);

        return { uid: userRecord.uid, ...userData };
    } catch (error) {
        console.error(`Gagal membuat pengguna untuk ${userData.email}:`, error.message);
        throw error; // Lemparkan error untuk menghentikan proses jika ada kegagalan
    }
}

async function seed() {
    try {
        // === Langkah 1: Buat Perwakilan (Representatives) ===
        console.log(`\nMembuat ${TOTAL_REPRESENTATIVES} perwakilan...`);
        const representatives = [];
        for (let i = 0; i < TOTAL_REPRESENTATIVES; i++) {
            const userData = {
                name: faker.person.fullName(),
                email: faker.internet.email({ firstName: `rep${i+1}` }),
                phone: faker.phone.number(),
                address: faker.location.streetAddress(true),
            };
            const user = await createUser(userData, { role: 'representatif' });
            representatives.push(user);
        }
        console.log('Perwakilan berhasil dibuat.');

        // === Langkah 2: Buat Reseller yang diundang oleh Perwakilan ===
        console.log(`\nMembuat ${RESELLERS_PER_REPRESENTATIVE} reseller untuk setiap perwakilan...`);
        const directResellers = [];
        for (const rep of representatives) {
            for (let i = 0; i < RESELLERS_PER_REPRESENTATIVE; i++) {
                const userData = {
                    name: faker.person.fullName(),
                    email: faker.internet.email({ firstName: `reseller-direct-${directResellers.length + 1}` }),
                    phone: faker.phone.number(),
                    address: faker.location.streetAddress(true),
                    referralId: rep.uid,
                };
                const user = await createUser(userData, {
                    role: 'reseller',
                    representativeId: rep.uid,
                });
                directResellers.push(user);
            }
        }
        console.log(`${directResellers.length} reseller langsung berhasil dibuat.`);

        // === Langkah 3: Buat Reseller yang diundang oleh Reseller lain ===
        console.log(`\nMembuat ${ADDITIONAL_RESELLERS} reseller tambahan...`);
        for (let i = 0; i < ADDITIONAL_RESELLERS; i++) {
            // Pilih reseller pengundang secara acak dari yang sudah ada
            const invitingReseller = directResellers[i % directResellers.length];
            const representativeId = (await auth.getUser(invitingReseller.uid)).customClaims.representativeId;

            const userData = {
                name: faker.person.fullName(),
                email: faker.internet.email({ firstName: `reseller-indirect-${i + 1}` }),
                phone: faker.phone.number(),
                address: faker.location.streetAddress(true),
                referralId: invitingReseller.uid,
            };
            await createUser(userData, {
                role: 'reseller',
                representativeId: representativeId,
            });
        }
        console.log(`${ADDITIONAL_RESELLERS} reseller tambahan berhasil dibuat.`);

        const totalUsers = TOTAL_REPRESENTATIVES + directResellers.length + ADDITIONAL_RESELLERS;
        console.log(`\nProses seeding selesai! Berhasil membuat total ${totalUsers} pengguna.`);

    } catch (error) {
        console.error('\nProses seeding gagal karena terjadi kesalahan. Proses dihentikan.');
        // Pertimbangkan untuk menambahkan logika pembersihan (cleanup) di sini jika diperlukan
    }
}

seed();
