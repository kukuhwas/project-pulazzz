// firebase-config.js

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.19.1/firebase-app.js";
import { initializeFirestore, memoryLocalCache, connectFirestoreEmulator } from "https://www.gstatic.com/firebasejs/9.19.1/firebase-firestore.js";
import { getFunctions, connectFunctionsEmulator } from "https://www.gstatic.com/firebasejs/9.19.1/firebase-functions.js";
import { getAuth, connectAuthEmulator } from "https://www.gstatic.com/firebasejs/9.19.1/firebase-auth.js";

// Konfigurasi Firebase untuk aplikasi web Anda
const firebaseConfig = {
  apiKey: "AIzaSyDs4aOD0y4BSN67GCd-6RrksbOPfED6V_g",
  authDomain: "project-pulazzz.firebaseapp.com",
  projectId: "project-pulazzz",
  storageBucket: "project-pulazzz.firebasestorage.app",
  messagingSenderId: "502938566803",
  appId: "1:502938566803:web:3213e37504abd88627cd66"
};

// Inisialisasi Firebase App
const app = initializeApp(firebaseConfig);

// Inisialisasi semua service
const db = initializeFirestore(app, {
  localCache: memoryLocalCache()
});
const functions = getFunctions(app, 'asia-southeast2');
const auth = getAuth(app);

// KUNCI PENGAMAN: Cek jika kita berada di lingkungan lokal (emulator)
if (window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost") {
    console.log("Mode development: Menghubungkan ke Firebase Emulators...");
    
    // Hubungkan ke masing-masing emulator di port defaultnya
    connectAuthEmulator(auth, "http://127.0.0.1:9099");
    connectFirestoreEmulator(db, "127.0.0.1", 8080);
    connectFunctionsEmulator(functions, "127.0.0.1", 5001);
}

// Ekspor semua layanan yang sudah dikonfigurasi
export { db, functions, auth };
