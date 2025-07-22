// functions/seed.js

const admin = require("firebase-admin");

// --- BLOK 2: Untuk koneksi ke database LIVE/PRODUKSI ---
// Pastikan file 'service-account-key-production.json' ada di folder functions
const serviceAccount = require("./service-account-key-production.json");
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
console.log("Menghubungkan ke database LIVE/PRODUKSI...");
const db = admin.firestore();
// --- AKHIR BLOK 2 ---


// --- DATA PRODUK BARU DENGAN STRUKTUR FINAL ---
const newProductData = [
    // Ortho Series
    { "type": "Ortho Series", "size": "180x200", "thickness": 30, "price": 3099000 },
    { "type": "Ortho Series", "size": "160x200", "thickness": 30, "price": 2859000 },
    { "type": "Ortho Series", "size": "145x200", "thickness": 30, "price": 2619000 },
    { "type": "Ortho Series", "size": "120x200", "thickness": 30, "price": 2379000 },
    { "type": "Ortho Series", "size": "100x200", "thickness": 30, "price": 2139000 },
    { "type": "Ortho Series", "size": "90x200", "thickness": 30, "price": 1899000 },
    { "type": "Ortho Series", "size": "180x200", "thickness": 25, "price": 2999000 },
    { "type": "Ortho Series", "size": "160x200", "thickness": 25, "price": 2759000 },
    { "type": "Ortho Series", "size": "145x200", "thickness": 25, "price": 2519000 },
    { "type": "Ortho Series", "size": "120x200", "thickness": 25, "price": 2279000 },
    { "type": "Ortho Series", "size": "100x200", "thickness": 25, "price": 2039000 },
    { "type": "Ortho Series", "size": "90x200", "thickness": 25, "price": 1799000 },
    // Comfort Series
    { "type": "Comfort Series", "size": "180x200", "thickness": 30, "price": 3099000 },
    { "type": "Comfort Series", "size": "160x200", "thickness": 30, "price": 2859000 },
    { "type": "Comfort Series", "size": "145x200", "thickness": 30, "price": 2619000 },
    { "type": "Comfort Series", "size": "120x200", "thickness": 30, "price": 2379000 },
    { "type": "Comfort Series", "size": "100x200", "thickness": 30, "price": 2139000 },
    { "type": "Comfort Series", "size": "90x200", "thickness": 30, "price": 1899000 },
    { "type": "Comfort Series", "size": "180x200", "thickness": 25, "price": 2999000 },
    { "type": "Comfort Series", "size": "160x200", "thickness": 25, "price": 2759000 },
    { "type": "Comfort Series", "size": "145x200", "thickness": 25, "price": 2519000 },
    { "type": "Comfort Series", "size": "120x200", "thickness": 25, "price": 2279000 },
    { "type": "Comfort Series", "size": "100x200", "thickness": 25, "price": 2039000 },
    { "type": "Comfort Series", "size": "90x200", "thickness": 25, "price": 1799000 }
];


async function deleteCollection(collectionPath) {
    const collectionRef = db.collection(collectionPath);
    const snapshot = await collectionRef.limit(500).get();
    if (snapshot.size === 0) return;
    const batch = db.batch();
    snapshot.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
    await deleteCollection(collectionPath);
}

async function seedProducts() {
    console.log("Menghapus data produk lama...");
    await deleteCollection('products');
    console.log("Data produk lama berhasil dihapus.");

    console.log("Memasukkan data produk baru...");
    const batch = db.batch();
    const productsRef = db.collection('products');

    newProductData.forEach(product => {
        const docId = `${product.type.toLowerCase().replace(' ', '_')}_${product.size.replace('x', '')}_${product.thickness}`;
        const docRef = productsRef.doc(docId);
        
        batch.set(docRef, {
            type: product.type,
            size: product.size,
            thickness: product.thickness,
            price: product.price
        });
    });

    await batch.commit();
    console.log(`✅ Berhasil memasukkan ${newProductData.length} data produk baru.`);
}

async function main() {
    try {
        await seedProducts();
        console.log('\nProses seeding data produk selesai!');
    } catch (error) {
        console.error('Terjadi kesalahan saat seeding data:', error);
    }
}

main();