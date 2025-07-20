// file: functions/import.js

const { v1 } = require('@google-cloud/firestore');
const { credentials } = require('@grpc/grpc-js'); // <-- Impor baru yang penting
const path = require('path');

// --- KONFIGURASI ---
const projectId = 'project-pulazzz';
const dataPath = '/Users/kukuh/Documents/firebase project/project-pulazzz/imported-data/2025-07-20T00:54:27_43157';
// --------------------

async function importData() {
  // Secara eksplisit membuat koneksi 'insecure' ke emulator
  const client = new v1.FirestoreAdminClient({
    servicePath: '127.0.0.1',
    port: 8080,
    // Kunci perbaikannya ada di sini:
    sslCreds: credentials.createInsecure(),
  });

  const databasePath = client.databasePath(projectId, '(default)');
  const request = {
    database: databasePath,
    inputUri: dataPath,
  };

  console.log(`Memulai proses impor data dari: ${dataPath}`);
  console.log(`Menuju ke database: ${databasePath}`);

  try {
    const [response] = await client.importDocuments(request);
    console.log('Perintah impor berhasil dikirim. Proses berjalan di latar belakang.');
    console.log('Silakan periksa log emulator atau Emulator UI untuk melihat progresnya.');
    console.log('Nama operasi:', response.name);
  } catch (err) {
    console.error('TERJADI ERROR SAAT MENCOBA MENGIMPOR:', err);
  }
}

importData();
