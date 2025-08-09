// public/js/auth.js

import { auth } from './firebase-config.js';
// PERBAIKAN: Tambahkan sendPasswordResetEmail
import { signInWithEmailAndPassword, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/9.19.1/firebase-auth.js";

// Referensi Elemen
const loginForm = document.getElementById('login-form');
const emailInput = document.getElementById('login-email');
const passwordInput = document.getElementById('login-password');
const errorDiv = document.getElementById('login-error');
// PERBAIKAN: Tambahkan referensi untuk tombol dan link
const loginButton = document.getElementById('login-button');
const forgotPasswordLink = document.getElementById('forgot-password-link');

// Event Listener untuk form login
loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  // Sembunyikan pesan error sebelumnya
  errorDiv.classList.add('d-none');

  // PERBAIKAN: Tampilkan status loading di tombol
  loginButton.disabled = true;
  loginButton.innerHTML = `<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Memproses...`;

  const email = emailInput.value;
  const password = passwordInput.value;

  try {
    // Coba login dengan Firebase Auth
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // Tunggu hingga token ID siap untuk mendapatkan peran
    const idTokenResult = await user.getIdTokenResult(true);
    const role = idTokenResult.claims.role;

    // Arahkan semua pengguna ke dashboard setelah login berhasil
    // Pengalihan oleh auth-guard.js lebih direkomendasikan, tapi ini tetap berfungsi.
    window.location.href = 'dashboard.html';

  } catch (error) {
    // Jika gagal, tampilkan pesan error
    console.error("Login Gagal:", error.code);
    errorDiv.classList.remove('d-none');

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
  } finally {
    // PERBAIKAN: Kembalikan tombol ke keadaan semula jika terjadi error
    loginButton.disabled = false;
    loginButton.innerHTML = 'Login';
  }
});


// PERBAIKAN: Tambahkan event listener untuk link lupa password
forgotPasswordLink.addEventListener('click', async (e) => {
  e.preventDefault();

  const { value: email } = await Swal.fire({
    title: 'Reset Password',
    input: 'email',
    inputLabel: 'Masukkan alamat email Anda yang terdaftar',
    inputPlaceholder: 'email@contoh.com',
    showCancelButton: true,
    cancelButtonText: 'Batal',
    confirmButtonText: 'Kirim Link Reset'
  });

  if (email) {
    try {
      await sendPasswordResetEmail(auth, email);
      Swal.fire('Terkirim!', 'Link untuk mereset password telah dikirim ke email Anda.', 'success');
    } catch (error) {
      console.error("Gagal mengirim email reset:", error);
      let errorMessage = 'Terjadi kesalahan. Coba lagi.';
      if (error.code === 'auth/user-not-found') {
        errorMessage = 'Email yang Anda masukkan tidak terdaftar.';
      }
      Swal.fire('Gagal', errorMessage, 'error');
    }
  }
});