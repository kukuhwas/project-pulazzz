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
    const hierarchySection = document.getElementById('hierarchy-section');
    const hierarchyTreeContainer = document.getElementById('hierarchy-tree-container');


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
    const getUserHierarchy = httpsCallable(functions, 'getUserHierarchy');

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

    /**
     * Secara rekursif merender struktur pohon menjadi HTML.
     * Handles both tree (for reps) and flat list (for resellers).
     */
    function renderHierarchyTree(nodes, isTopLevel = true) {
        if (!nodes || nodes.length === 0) return '';

        // For resellers, the data is a flat list. For reps, it's a tree.
        // The `isTopLevel` check helps us decide whether to wrap in the main `user-tree` class.
        let html = isTopLevel ? '<ul class="user-tree">' : '<ul>';

        nodes.forEach(node => {
            const hasChildren = node.children && node.children.length > 0;
            const userName = node.role === 'representatif' ? `<strong>${node.name}</strong>` : node.name;
            const isCurrentUser = node.uid === currentUser.uid;

            // Don't show the collapse icon for the top-level representative themselves
            const isCollapsible = hasChildren && !isCurrentUser;

            html += `<li data-uid="${node.uid}" class="${isCollapsible ? 'expanded' : ''}">`;
            html += `<span class="tree-node ${isCollapsible ? 'collapsible' : ''}">`;

            if (isCollapsible) {
                html += '<i class="bi bi-caret-down-fill me-1"></i>';
            }

            // Add a 'You' badge for the current user in the hierarchy
            if(isCurrentUser) {
                html += `${userName} <span class="badge bg-primary">Anda</span>`;
            } else {
                html += `${userName} <span class="text-muted small">(${node.email} - ${node.role})</span>`;
            }
            html += '</span>';

            if (hasChildren) {
                // Pass false for isTopLevel in recursive calls
                html += renderHierarchyTree(node.children, false);
            }
            html += '</li>';
        });
        html += '</ul>';

        return html;
    }

    async function loadHierarchy(userRole) {
        if (userRole !== 'reseller' && userRole !== 'representatif') {
            hierarchySection.classList.add('d-none');
            return;
        }

        hierarchySection.classList.remove('d-none');

        try {
            const result = await getUserHierarchy();
            const data = result.data;

            if (!data || data.length === 0) {
                hierarchyTreeContainer.innerHTML = '<p class="text-muted">Tidak ada pengguna dalam hierarki Anda.</p>';
                return;
            }

            const treeHtml = renderHierarchyTree(data);
            hierarchyTreeContainer.innerHTML = treeHtml;

        } catch (error) {
            console.error("Gagal memuat hierarki:", error);
            hierarchyTreeContainer.innerHTML = '<p class="text-danger">Gagal memuat hierarki pengguna.</p>';
        }
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
                    representativeView.textContent = repSnap.exists() ? (repSnap.data().name || repSnap.data().email) : 'Data representatif tidak ditemukan.';
                } else {
                    representativeInfoEl.style.display = 'none';
                }

                loadingIndicator.classList.add('d-none');
                profileContent.classList.remove('d-none');

                // Load hierarchy after profile is loaded
                loadHierarchy(profileData.role);

            } else {
                loadingIndicator.textContent = 'Gagal menemukan data profil.';
            }

        } catch (error) {
            console.error("Gagal memuat profil:", error);
            loadingIndicator.textContent = 'Terjadi kesalahan saat memuat profil.';
        }
    }

    onAuthStateChanged(auth, (user) => {
        const mainSpinner = document.querySelector('#main-header .spinner-border');
        if (user) {
            currentUser = user;
            loadProfileData(user.uid);
        } else {
            loadingIndicator.textContent = 'Anda harus login untuk melihat halaman ini.';
        }
        if(mainSpinner) mainSpinner.classList.add('d-none');
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

    hierarchyTreeContainer.addEventListener('click', (event) => {
        const target = event.target;
        if (target.matches('.collapsible, .collapsible i')) {
            const node = target.closest('li');
            node.classList.toggle('expanded');
            const icon = node.querySelector('.bi');
            if (icon) {
                icon.classList.toggle('bi-caret-right-fill');
                icon.classList.toggle('bi-caret-down-fill');
            }
        }
    });
});
