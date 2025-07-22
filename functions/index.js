// functions/index.js

const admin = require("firebase-admin");

// Inisialisasi Firebase Admin SDK sekali di file utama
admin.initializeApp();

// Impor semua fungsi dari file-file modul
const userFunctions = require('./users.js');
const orderFunctions = require('./orders.js');
const invoicingFunctions = require('./invoicing.js');
const locationFunctions = require('./locations.js'); // <-- TAMBAHKAN INI

// Ekspor semua fungsi yang sudah diimpor agar bisa dideteksi oleh Firebase
module.exports = {
    ...userFunctions,
    ...orderFunctions,
    ...invoicingFunctions,
    ...locationFunctions, // <-- TAMBAHKAN INI
};
