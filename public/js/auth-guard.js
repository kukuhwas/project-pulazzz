// public/js/auth-guard.js

/**
 * @file auth-guard.js
 * @description Skrip ini berfungsi sebagai penjaga keamanan (auth guard) untuk seluruh aplikasi.
 * Tujuannya adalah untuk memastikan pengguna yang belum login tidak dapat mengakses halaman
 * yang dilindungi, dan pengguna yang sudah login diarahkan dengan benar.
 */

import { auth } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.19.1/firebase-auth.js";

// --- Konfigurasi Halaman ---

/**
 * @const {string[]} protectedPages
 * @description Daftar nama file halaman yang memerlukan login untuk diakses.
 */
const protectedPages = ['order-form.html', 'dashboard.html', 'admin.html', 'profile.html', 'invite.html'];

/**
 * @const {string[]} publicPages
 * @description Daftar nama file halaman yang bisa diakses tanpa login.
 * Pengguna yang sudah login akan diarahkan menjauh dari halaman ini.
 */
const publicPages = ['login.html', 'signup.html'];

/**
 * @const {string} currentPage
 * @description Mengambil nama file dari URL saat ini untuk dicocokkan dengan daftar di atas.
 */
const currentPage = window.location.pathname.split('/').pop();


/**
 * @function onAuthStateChanged
 * @description Listener utama dari Firebase Authentication.
 * Fungsi ini akan berjalan secara otomatis saat halaman dimuat dan setiap kali
 * status login pengguna berubah.
 */
onAuthStateChanged(auth, async (user) => {
    // Cek jika objek 'user' ada, yang menandakan pengguna sudah login.
    if (user) {
        // --- KASUS 1: PENGGUNA SUDAH LOGIN ---

        // Jika pengguna yang sudah login mencoba membuka halaman publik (login/signup),
        // secara otomatis arahkan mereka ke halaman utama setelah login, yaitu dashboard.
        if (publicPages.includes(currentPage)) {
            window.location.replace('/dashboard.html');
            return; // Hentikan eksekusi lebih lanjut
        }

        // Ambil peran (role) pengguna dari custom claims untuk aturan akses khusus.
        const idTokenResult = await user.getIdTokenResult(true);
        const userRole = idTokenResult.claims.role;

        // Aturan spesifik: Pengguna dengan peran 'produksi' tidak boleh mengakses
        // halaman form pemesanan. Arahkan mereka ke dashboard jika mencoba.
        if (userRole === 'produksi' && currentPage === 'order-form.html') {
            alert('Akses ditolak. Anda tidak memiliki izin untuk membuat pesanan baru.');
            window.location.replace('/dashboard.html');
            return; 
        }

        // --- PERUBAHAN DI SINI ---
        // Aturan spesifik: Hanya pengguna dengan peran 'admin' yang boleh mengakses halaman admin.
        if (userRole !== 'admin' && currentPage === 'admin.html') {
            alert('Akses Ditolak. Halaman ini khusus untuk Admin.');
            window.location.replace('/dashboard.html');
            return;
        }

    } else {
        // --- KASUS 2: PENGGUNA TIDAK LOGIN ---

        // Jika pengguna yang belum login mencoba membuka salah satu halaman yang dilindungi,
        // paksa arahkan mereka ke halaman login.
        if (protectedPages.includes(currentPage)) {
            window.location.replace('/login.html');
        }
    }
});
