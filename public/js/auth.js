import { auth } from './firebase-config.js';
import { signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/9.19.1/firebase-auth.js";

// Referensi Elemen
const loginForm = document.getElementById('login-form');
const emailInput = document.getElementById('login-email');
const passwordInput = document.getElementById('login-password');
const errorDiv = document.getElementById('login-error');

// Event Listener untuk form login
loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  
  const email = emailInput.value;
  const password = passwordInput.value;
  
  try {
    // Coba login dengan Firebase Auth
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // Tunggu hingga token ID siap untuk mendapatkan peran
    const idTokenResult = await user.getIdTokenResult(true); // 'true' untuk memaksa refresh token
    const role = idTokenResult.claims.role;

    // Arahkan pengguna berdasarkan peran
    if (role === 'admin') {
      window.location.href = 'admin.html';
    } else {
      window.location.href = 'dashboard.html';
    }

  } catch (error) {
    // Jika gagal, tampilkan pesan error
    console.error("Login Gagal:", error.code);
    errorDiv.classList.remove('d-none'); // Tampilkan div error
    
    switch (error.code) {
      case 'auth/user-not-found':
      case 'auth/invalid-email':
        errorDiv.textContent = 'Email yang Anda masukkan tidak terdaftar.';
        break;
      case 'auth/wrong-password':
        errorDiv.textContent = 'Password yang Anda masukkan salah.';
        break;
      default:
        errorDiv.textContent = 'Terjadi kesalahan. Silakan coba lagi.';
    }
  }
});