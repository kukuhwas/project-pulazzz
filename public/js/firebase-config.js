import { initializeApp } from "https://www.gstatic.com/firebasejs/9.19.1/firebase-app.js";
import { initializeFirestore, memoryLocalCache } from "https://www.gstatic.com/firebasejs/9.19.1/firebase-firestore.js";
import { getFunctions } from "https://www.gstatic.com/firebasejs/9.19.1/firebase-functions.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/9.19.1/firebase-auth.js";

// Konfigurasi Firebase untuk aplikasi web Anda
// TODO: Ganti dengan konfigurasi proyek Firebase Anda
const firebaseConfig = {
  apiKey: "AIzaSyDs4aOD0y4BSN67GCd-6RrksbOPfED6V_g",
  authDomain: "project-pulazzz.firebaseapp.com",
  projectId: "project-pulazzz",
  storageBucket: "project-pulazzz.firebasestorage.app",
  messagingSenderId: "502938566803",
  appId: "1:502938566803:web:3213e37504abd88627cd66"
};

const app = initializeApp(firebaseConfig);

// --- PERUBAHAN UTAMA DI SINI ---
// Inisialisasi Firestore dengan cache di memori (menonaktifkan penyimpanan offline)
const db = initializeFirestore(app, {
  localCache: memoryLocalCache()
});
// --- AKHIR PERUBAHAN ---

// Ekspor semua layanan
export { db };
export const functions = getFunctions(app, 'asia-southeast2');
export const auth = getAuth(app);
