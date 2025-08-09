// public/js/firebase-config.js

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.19.1/firebase-app.js";
import { initializeFirestore, memoryLocalCache, connectFirestoreEmulator } from "https://www.gstatic.com/firebasejs/9.19.1/firebase-firestore.js";
import { getFunctions, connectFunctionsEmulator } from "https://www.gstatic.com/firebasejs/9.19.1/firebase-functions.js";
import { getAuth, connectAuthEmulator } from "https://www.gstatic.com/firebasejs/9.19.1/firebase-auth.js";

// Konfigurasi untuk lingkungan Produksi (default)
const prodConfig = {
  apiKey: "AIzaSyDs4aOD0y4BSN67GCd-6RrksbOPfED6V_g",
  authDomain: "project-pulazzz.firebaseapp.com",
  projectId: "project-pulazzz",
  storageBucket: "project-pulazzz.firebasestorage.app",
  messagingSenderId: "502938566803",
  appId: "1:502938566803:web:3213e37504abd88627cd66"
};

// Konfigurasi untuk lingkungan Staging
const stagingConfig = {
  apiKey: "AIzaSyDQ7aXo6LNj3SvjT0ZpNQinphuidTtdAq8",
  authDomain: "project-pulazzz-staging.firebaseapp.com",
  projectId: "project-pulazzz-staging",
  storageBucket: "project-pulazzz-staging.firebasestorage.app",
  messagingSenderId: "934288480975",
  appId: "1:934288480975:web:47e496a66ace18127575ba"
};

// --- Logika Pemilihan Konfigurasi ---
let firebaseConfig;
const hostname = window.location.hostname;

if (hostname.includes('staging')) {
  firebaseConfig = stagingConfig;
  console.log("Menggunakan konfigurasi Staging.");
} else {
  firebaseConfig = prodConfig;
  console.log("Menggunakan konfigurasi Produksi.");
}

// Inisialisasi Firebase App dengan konfigurasi yang dipilih
const app = initializeApp(firebaseConfig);

// Inisialisasi semua service
const db = initializeFirestore(app, {
  localCache: memoryLocalCache()
});
const functions = getFunctions(app, 'asia-southeast2');
const auth = getAuth(app);

// KUNCI PENGAMAN: Cek jika kita berada di lingkungan lokal (emulator)
if (hostname === "127.0.0.1" || hostname === "localhost") {
    console.log("Mode development: Menghubungkan ke Firebase Emulators...");
    
    // Hubungkan ke masing-masing emulator di port defaultnya
    connectAuthEmulator(auth, "http://127.0.0.1:9099");
    connectFirestoreEmulator(db, "127.0.0.1", 8080);
    connectFunctionsEmulator(functions, "127.0.0.1", 5001);
}

// Ekspor semua layanan yang sudah dikonfigurasi
export { db, functions, auth };
