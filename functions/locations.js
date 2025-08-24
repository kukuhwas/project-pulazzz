// functions/locations.js

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const fs = require('fs');
const path = require('path');

// Path ke file lokasi
const locationsFile = path.join(__dirname, 'locations.json');

/**
 * Cloud Function: searchAddress
 * Mencari alamat berdasarkan nama kecamatan (district).
 * Mengembalikan maksimal 20 hasil yang cocok.
 */
const searchAddress = onCall({ region: 'asia-southeast2' }, async (request) => {
    try {
        const query = request.data.query;
        if (!query || typeof query !== 'string' || query.length < 3) {
            return [];
        }

        // Baca dan parse data lokasi
        const data = fs.readFileSync(locationsFile, 'utf8');
        const locations = JSON.parse(data);

        const lowerQuery = query.toLowerCase();

        const results = locations
            .filter(loc => loc.district.toLowerCase().includes(lowerQuery))
            .slice(0, 20)
            .map(loc => ({
                id: loc.id,
                text: `Kec. ${loc.district}, ${loc.city}, ${loc.province}`,
                district: loc.district,
                city: loc.city,
                province: loc.province
            }));

        return results;
    } catch (error) {
        console.error('Gagal melakukan pencarian alamat:', error);
        throw new HttpsError('internal', 'Gagal mencari alamat.');
    }
});

module.exports = {
    searchAddress
};
