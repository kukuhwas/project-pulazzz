// public/js/signup.js

import { functions } from './firebase-config.js';
import { httpsCallable } from "https://www.gstatic.com/firebasejs/9.19.1/firebase-functions.js";

document.addEventListener('DOMContentLoaded', () => {
    const signupForm = document.getElementById('signup-form');
    const loadingIndicator = document.getElementById('loading-indicator');
    const errorMessageDiv = document.getElementById('error-message');

    // --- Referensi Input Form ---
    const emailInput = document.getElementById('signup-email');
    const nameInput = document.getElementById('signup-name');
    const phoneInput = document.getElementById('signup-phone');
    const addressInput = document.getElementById('signup-address');
    const passwordInput = document.getElementById('signup-password');
    const confirmPasswordInput = document.getElementById('signup-confirm-password');
    const submitButton = signupForm.querySelector('button[type="submit"]');

    // Ambil kode referal dari URL
    const params = new URLSearchParams(window.location.search);
    const referralCode = params.get('ref');

    // Buat referensi ke Cloud Function
    const completeSignup = httpsCallable(functions, 'completeSignup');
    // TODO: Idealnya, ada fungsi `getInvitationDetails` untuk memvalidasi kode dan mengisi email.
    // Untuk saat ini, validasi terjadi saat submit.

    if (!referralCode) {
        loadingIndicator.classList.add('d-none');
        errorMessageDiv.classList.remove('d-none');
        errorMessageDiv.textContent = 'Kode undangan tidak ditemukan. Pastikan Anda menggunakan link yang benar.';
        return;
    }

    // Tampilkan form setelah memastikan kode ada
    loadingIndicator.classList.add('d-none');
    signupForm.classList.remove('d-none');

    // Event listener untuk submit form
    signupForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        // Validasi password
        if (passwordInput.value !== confirmPasswordInput.value) {
            Swal.fire('Error', 'Password dan konfirmasi password tidak cocok.', 'error');
            return;
        }

        submitButton.disabled = true;
        submitButton.innerHTML = `<span class="spinner-border spinner-border-sm"></span> Mendaftar...`;

        try {
            const payload = {
                referralCode: referralCode,
                password: passwordInput.value,
                name: nameInput.value,
                phone: `62${phoneInput.value}`, // Asumsi pengguna mengetik 8xxx
                address: addressInput.value,
            };

            // Panggil Cloud Function
            const result = await completeSignup(payload);

            // Tampilkan pesan sukses dan arahkan ke halaman login
            await Swal.fire({
                icon: 'success',
                title: 'Pendaftaran Berhasil!',
                text: 'Akun Anda telah dibuat. Silakan login untuk melanjutkan.',
                allowOutsideClick: false,
            });

            window.location.href = '/login.html';

        } catch (error) {
            console.error('Gagal menyelesaikan pendaftaran:', error);
            Swal.fire({
                icon: 'error',
                title: 'Pendaftaran Gagal',
                text: `Terjadi kesalahan: ${error.message}`,
            });
        } finally {
            submitButton.disabled = false;
            submitButton.innerHTML = `<i class="bi bi-check-circle-fill"></i> Daftar dan Buat Akun`;
        }
    });

});