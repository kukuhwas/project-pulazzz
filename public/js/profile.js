// public/js/profile.js (Versi Lengkap Terupdate)

import { auth, functions } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.19.1/firebase-auth.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/9.19.1/firebase-functions.js";

document.addEventListener('DOMContentLoaded', () => {
    // Referensi Elemen Umum
    const loadingIndicator = document.getElementById('loading-indicator');
    const profileContent = document.getElementById('profile-content');
    const roleBadge = document.getElementById('user-role-badge');

    // Mode Lihat
    const viewMode = document.getElementById('view-mode');
    const nameView = document.getElementById('profile-name-view');
    const emailView = document.getElementById('profile-email-view');
    const phoneView = document.getElementById('profile-phone-view');
    const addressView = document.getElementById('profile-address-view');
    const representativeInfoEl = document.getElementById('representative-info');
    const representativeView = document.getElementById('profile-representative-view');
    const referralInfoEl = document.getElementById('referral-info');
    const referrerView = document.getElementById('profile-referrer-view');

    // Mode Edit
    const editMode = document.getElementById('edit-mode');
    const nameEdit = document.getElementById('profile-name-edit');
    const phoneEdit = document.getElementById('profile-phone-edit');
    const addressEdit = document.getElementById('profile-address-edit');

    // Tombol
    const backBtn = document.getElementById('back-btn');
    const editProfileBtn = document.getElementById('edit-profile-btn');
    const saveProfileBtn = document.getElementById('save-profile-btn');
    const cancelEditBtn = document.getElementById('cancel-edit-btn');

    // Referensi Cloud Functions
    const getUserProfile = httpsCallable(functions, 'getUserProfile');
    const updateUserProfile = httpsCallable(functions, 'updateUserProfile');

    let currentUser = null;

    const roleBadges = {
        admin: { class: 'bg-danger', text: 'Admin' },
        reseller: { class: 'bg-info text-dark', text: 'Reseller' },
        representatif: { class: 'bg-success', text: 'Representatif' },
        produksi: { class: 'bg-warning text-dark', text: 'Produksi' },
    };

    function toggleEditMode(isEditing) {
        viewMode.classList.toggle('d-none', isEditing);
        editMode.classList.toggle('d-none', !isEditing);
        editProfileBtn.classList.toggle('d-none', isEditing);
        backBtn.classList.toggle('d-none', isEditing);
        saveProfileBtn.classList.toggle('d-none', !isEditing);
        cancelEditBtn.classList.toggle('d-none', !isEditing);
    }

    async function loadProfileData() {
        if (!currentUser) return;
        try {
            const result = await getUserProfile();
            const profileData = result.data;

            // Isi Mode Lihat
            nameView.textContent = profileData.name || '-';
            emailView.textContent = profileData.email || '-';
            phoneView.textContent = profileData.phone || '-';
            addressView.textContent = profileData.address || '-';

            // Isi Mode Edit (untuk persiapan)
            nameEdit.value = profileData.name || '';
            phoneEdit.value = (profileData.phone || '').replace('62', '');
            addressEdit.value = profileData.address || '';

            // Set badge peran
            const badgeInfo = roleBadges[profileData.role] || { class: 'bg-secondary', text: profileData.role };
            roleBadge.textContent = badgeInfo.text;
            roleBadge.className = `badge ${badgeInfo.class}`;

            // Tampilkan info representatif ("Guru")
            if (profileData.representativeName) {
                representativeInfoEl.style.display = 'block';
                representativeView.textContent = profileData.representativeName;
            } else {
                representativeInfoEl.style.display = 'none';
            }

            // Tampilkan info pereferensi ("Orang Tua")
            if (profileData.referrerName) {
                referralInfoEl.style.display = 'block';
                referrerView.textContent = profileData.referrerName;
            } else {
                referralInfoEl.style.display = 'none';
            }

            loadingIndicator.classList.add('d-none');
            profileContent.classList.remove('d-none');
        } catch (error) {
            console.error("Gagal memuat profil:", error);
            loadingIndicator.textContent = 'Terjadi kesalahan saat memuat profil.';
        }
    }

    onAuthStateChanged(auth, (user) => {
        if (user) {
            currentUser = user;
            loadProfileData();
        } else {
            // Ditangani oleh auth-guard.js
        }
    });

    editProfileBtn.addEventListener('click', () => toggleEditMode(true));
    cancelEditBtn.addEventListener('click', () => toggleEditMode(false));
    backBtn.addEventListener('click', () => window.location.href = 'dashboard.html');

    saveProfileBtn.addEventListener('click', async () => {
        const phoneValue = phoneEdit.value.replace(/\D/g, '');
        const updatedData = {
            name: nameEdit.value,
            phone: `62${phoneValue}`,
            address: addressEdit.value
            // Kita tidak lagi mengirim 'district', 'city', 'province' jika tidak ada di form edit
        };

        Swal.fire({ title: 'Menyimpan...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

        try {
            await updateUserProfile(updatedData);
            await loadProfileData(); // Muat ulang data untuk menampilkan perubahan
            toggleEditMode(false);
            Swal.fire('Berhasil!', 'Profil Anda telah diperbarui.', 'success');
        } catch (error) {
            console.error("Gagal memperbarui profil:", error);
            Swal.fire('Gagal', `Terjadi kesalahan: ${error.message}`, 'error');
        }
    });
});