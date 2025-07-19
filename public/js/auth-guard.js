import { auth } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.19.1/firebase-auth.js";

const logoutButton = document.getElementById('logout-btn');

// Pasang pendengar status autentikasi yang berjalan di setiap halaman
onAuthStateChanged(auth, async (user) => {
  // --- KASUS 1: PENGGUNA TIDAK LOGIN ---
  if (!user) {
    // Jika pengguna mencoba mengakses halaman selain login, tendang keluar
    if (window.location.pathname !== '/login.html' && window.location.pathname !== '/login') {
        console.log('User tidak login, mengarahkan ke halaman login...');
        window.location.href = 'login.html';
    }
    return; // Hentikan eksekusi
  }

  // --- KASUS 2: PENGGUNA SUDAH LOGIN ---
  // Periksa peran pengguna
  const idTokenResult = await user.getIdTokenResult();
  const userRole = idTokenResult.claims.role;

  // Aturan blokir: jika peran 'produksi' mencoba akses form, tendang ke dashboard
  if (userRole === 'produksi' && (window.location.pathname === '/index.html' || window.location.pathname === '/')) {
    console.log('Akses ditolak untuk peran produksi, mengarahkan ke dashboard...');
    alert('Akses ditolak. Anda tidak memiliki izin untuk membuat pesanan baru.');
    window.location.href = 'dashboard.html';
  }
});

// Tambahkan fungsionalitas pada tombol logout jika ada di halaman
if (logoutButton) {
  logoutButton.addEventListener('click', async () => {
    try {
      await signOut(auth);
      console.log('User berhasil logout.');
      // Arahkan ke halaman login setelah logout
      window.location.href = 'login.html';
    } catch (error) {
      console.error('Gagal logout:', error);
    }
  });
}