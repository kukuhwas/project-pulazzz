// functions/locations.js

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { getFirestore } = require("firebase-admin/firestore");

const db = getFirestore();

/**
 * Melakukan pencarian alamat berdasarkan query.
 * Memprioritaskan pencarian kota, lalu kecamatan.
 */
const searchAddress = onCall({ region: 'asia-southeast2' }, async (request) => {
    const queryText = request.data.query;
    if (!queryText || queryText.length < 3) {
        return [];
    }

    const lowerCaseQuery = queryText.toLowerCase();

    try {
        // --- Langkah 1: Cari di koleksi 'cities' terlebih dahulu ---
        const citiesRef = db.collection('cities');
        const cityQuery = citiesRef
            .where('name_lowercase', '>=', lowerCaseQuery)
            .where('name_lowercase', '<=', lowerCaseQuery + '\uf8ff')
            .limit(1);

        const citySnap = await cityQuery.get();

        let districts = [];
        if (!citySnap.empty) {
            // --- KASUS 1: KOTA DITEMUKAN ---
            const foundCity = citySnap.docs[0];
            const districtsRef = db.collection('districts');
            const districtsInCityQuery = districtsRef.where('cityId', '==', foundCity.id);
            const districtsSnap = await districtsInCityQuery.get();
            districts = districtsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } else {
            // --- KASUS 2: KOTA TIDAK DITEMUKAN, CARI DI KECAMATAN ---
            const districtsRef = db.collection('districts');
            const districtsQuery = districtsRef
                .where('name_lowercase', '>=', lowerCaseQuery)
                .where('name_lowercase', '<=', lowerCaseQuery + '\uf8ff')
                .limit(10);
            
            const districtsSnap = await districtsQuery.get();
            if (!districtsSnap.empty) {
                districts = districtsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            }
        }

        if (districts.length === 0) {
            return [];
        }

        // --- Langkah 2: Kumpulkan data pendukung ---
        const cityIds = [...new Set(districts.map(d => d.cityId))];
        const citiesSnap = await db.collection('cities').where('__name__', 'in', cityIds).get();
        const citiesMap = new Map(citiesSnap.docs.map(doc => [doc.id, doc.data()]));

        const provinceIds = [...new Set(Array.from(citiesMap.values()).map(c => c.provinceId))];
        const provincesSnap = await db.collection('provinces').where('__name__', 'in', provinceIds).get();
        const provincesMap = new Map(provincesSnap.docs.map(doc => [doc.id, doc.data()]));

        // --- Langkah 3: Gabungkan semua data ---
        const results = districts.map(district => {
            const city = citiesMap.get(district.cityId);
            const province = city ? provincesMap.get(city.provinceId) : null;
            const text = `${district.name}, ${city?.name || ''}, ${province?.name || ''}`;
            
            return {
                id: district.id,
                district: district.name,
                city: city?.name || '',
                province: province?.name || '',
                text: text
            };
        });

        return results;

    } catch (error) {
        console.error("Gagal melakukan pencarian alamat:", error);
        throw new HttpsError('internal', 'Gagal mencari alamat.');
    }
});

module.exports = {
    searchAddress
};
