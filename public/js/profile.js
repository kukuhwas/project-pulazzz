// public/js/profile.js

import { db, auth, functions } from './firebase-config.js';
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/9.19.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.19.1/firebase-auth.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/9.19.1/firebase-functions.js";

document.addEventListener('DOMContentLoaded', () => {

    // --- Referensi Elemen ---
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

    // Mode Edit
    const editMode = document.getElementById('edit-mode');
    const nameEdit = document.getElementById('profile-name-edit');
    const emailEdit = document.getElementById('profile-email-edit');
    const phoneEdit = document.getElementById('profile-phone-edit');
    const addressEdit = document.getElementById('profile-address-edit');

    // Tombol
    const backBtn = document.getElementById('back-btn');
    const editProfileBtn = document.getElementById('edit-profile-btn');
    const saveProfileBtn = document.getElementById('save-profile-btn');
    const cancelEditBtn = document.getElementById('cancel-edit-btn');

    // Referensi Cloud Function
    const updateUserProfile = httpsCallable(functions, 'updateUserProfile');

    // State
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

    async function loadProfileData(uid) {
        try {
            const profileRef = doc(db, 'profiles', uid);
            const profileSnap = await getDoc(profileRef);

            if (profileSnap.exists()) {
                const profileData = profileSnap.data();

                nameView.textContent = profileData.name || '-';
                emailView.textContent = profileData.email || '-';
                phoneView.textContent = profileData.phone || '-';
                addressView.textContent = profileData.address || '-';

                nameEdit.value = profileData.name || '';
                emailEdit.value = profileData.email || '';
                phoneEdit.value = (profileData.phone || '').replace('62', '');
                addressEdit.value = profileData.address || '';

                const badgeInfo = roleBadges[profileData.role] || { class: 'bg-secondary', text: profileData.role };
                roleBadge.textContent = badgeInfo.text;
                roleBadge.className = `badge ${badgeInfo.class}`;


                if (profileData.role === 'reseller' && profileData.representativeId) {
                    representativeInfoEl.style.display = 'block';
                    const repRef = doc(db, 'profiles', profileData.representativeId);
                    const repSnap = await getDoc(repRef);
                    representativeView.textContent = repSnap.exists() ? (repSnap.data().name || repSnap.data().email) : 'Data atasan tidak ditemukan.';
                } else {
                    representativeInfoEl.style.display = 'none';
                }

                loadingIndicator.classList.add('d-none');
                profileContent.classList.remove('d-none');

            } else {
                loadingIndicator.textContent = 'Gagal menemukan data profil.';
            }

        } catch (error) {
            console.error("Gagal memuat profil:", error);
            loadingIndicator.textContent = 'Terjadi kesalahan saat memuat profil.';
        }
    }

    onAuthStateChanged(auth, (user) => {
        if (user) {
            currentUser = user;
            loadProfileData(user.uid);
        } else {
            loadingIndicator.textContent = 'Anda harus login untuk melihat halaman ini.';
        }
    });

    editProfileBtn.addEventListener('click', () => {
        toggleEditMode(true);
    });

    cancelEditBtn.addEventListener('click', () => {
        toggleEditMode(false);
        if (currentUser) loadProfileData(currentUser.uid);
    });

    backBtn.addEventListener('click', () => {
        window.location.href = 'dashboard.html';
    });

    saveProfileBtn.addEventListener('click', async () => {
        const phoneValue = phoneEdit.value.replace(/\D/g, '');
        const fullPhone = `62${phoneValue}`;
        if (fullPhone.length < 11 || fullPhone.length > 15) {
            Swal.fire('Error', 'Panjang nomor telepon tidak valid.', 'error');
            return;
        }

        const updatedData = {
            name: nameEdit.value,
            phone: fullPhone,
            address: addressEdit.value
        };

        Swal.fire({
            title: 'Menyimpan perubahan...',
            allowOutsideClick: false,
            didOpen: () => Swal.showLoading()
        });

        try {
            await updateUserProfile(updatedData);
            await loadProfileData(currentUser.uid);
            toggleEditMode(false);
            Swal.fire('Berhasil!', 'Profil Anda telah diperbarui.', 'success');
        } catch (error) {
            console.error("Gagal memperbarui profil:", error);
            Swal.fire('Gagal', `Terjadi kesalahan: ${error.message}`, 'error');
        }
    });
});
