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
    const passwordInput = document.getElementById('signup-password');
    const confirmPasswordInput = document.getElementById('signup-confirm-password');
    const submitButton = signupForm.querySelector('button[type="submit"]');
    const streetInput = document.getElementById('signup-address-street');
    const addressSearchSelect = document.getElementById('signup-address-search');
    const hiddenProvinceInput = document.getElementById('signup-address-province');
    const hiddenCityInput = document.getElementById('signup-address-city');
    const hiddenDistrictInput = document.getElementById('signup-address-district');

    const params = new URLSearchParams(window.location.search);
    const referralCode = params.get('ref');

    const completeSignup = httpsCallable(functions, 'completeSignup');
    const searchAddress = httpsCallable(functions, 'searchAddress');
    const getInvitationDetails = httpsCallable(functions, 'getInvitationDetails');

    function initializeAddressSearch() {
        const tomSelect = new TomSelect(addressSearchSelect, {
            valueField: 'id',
            labelField: 'text',
            searchField: 'text',
            create: false,
            placeholder: 'Ketik min. 3 huruf nama kecamatan/kota...',
            render: {
                item: (data, escape) => `<div>${escape(data.district)}, ${escape(data.city)}, ${escape(data.province)}</div>`,
                option: (data, escape) => `<div><strong class="d-block">${escape(data.district)}</strong><small class="text-muted">${escape(data.city)}, ${escape(data.province)}</small></div>`,
            },
            load: (query, callback) => {
                if (query.length < 3) return callback();
                searchAddress({ query: query })
                    .then(result => callback(result.data))
                    .catch(error => {
                        console.error("Gagal mencari alamat:", error);
                        callback([]);
                    });
            }
        });
        tomSelect.on('change', (value) => {
            const selectedData = tomSelect.options[value];
            if (selectedData) {
                hiddenProvinceInput.value = selectedData.province;
                hiddenCityInput.value = selectedData.city;
                hiddenDistrictInput.value = selectedData.district;
            }
        });
    }

    async function verifyAndPopulateForm() {
        if (!referralCode) {
            loadingIndicator.classList.add('d-none');
            errorMessageDiv.classList.remove('d-none');
            errorMessageDiv.textContent = 'Kode undangan tidak ditemukan. Pastikan Anda menggunakan link yang benar.';
            return;
        }
        try {
            const result = await getInvitationDetails({ referralCode });
            emailInput.value = result.data.email;
            loadingIndicator.classList.add('d-none');
            signupForm.classList.remove('d-none');
            initializeAddressSearch();
        } catch (error) {
            console.error("Validasi undangan gagal:", error);
            loadingIndicator.classList.add('d-none');
            errorMessageDiv.classList.remove('d-none');
            errorMessageDiv.textContent = `Error: ${error.message}`;
        }
    }

    verifyAndPopulateForm();

    signupForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        if (passwordInput.value !== confirmPasswordInput.value) {
            Swal.fire('Error', 'Password dan konfirmasi password tidak cocok.', 'error');
            return;
        }
        if (!hiddenDistrictInput.value) {
            Swal.fire('Error', 'Harap pilih alamat (Kecamatan / Kota / Provinsi) yang valid dari pencarian.', 'error');
            return;
        }

        submitButton.disabled = true;
        submitButton.innerHTML = `<span class="spinner-border spinner-border-sm"></span> Mendaftar...`;

        try {
            const payload = {
                referralCode: referralCode,
                password: passwordInput.value,
                name: nameInput.value,
                phone: phoneInput.value,
                address: streetInput.value,
                district: hiddenDistrictInput.value,
                city: hiddenCityInput.value,
                province: hiddenProvinceInput.value,
            };

            // TAMBAHKAN BARIS INI UNTUK DEBUGGING
            console.log('Data yang akan dikirim:', payload);

            await completeSignup(payload);
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