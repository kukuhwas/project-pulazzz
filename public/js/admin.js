// public/js/admin.js

import { auth, functions } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.19.1/firebase-auth.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/9.19.1/firebase-functions.js";

document.addEventListener('DOMContentLoaded', () => {

    // --- Referensi Elemen ---
    const adminContent = document.getElementById('admin-content');
    const accessDenied = document.getElementById('access-denied');
    const userCardGrid = document.getElementById('user-card-grid');
    const userListLoading = document.getElementById('user-list-loading');
    const addUserForm = document.getElementById('add-user-form');
    const newUserRoleSelect = document.getElementById('new-user-role');
    const representativeSelectWrapper = document.getElementById('representative-select-wrapper');

    // --- Fungsi Cloud Functions ---
    const listAllUsers = httpsCallable(functions, 'listAllUsers');
    const createNewUser = httpsCallable(functions, 'createNewUser');
    const setUserRole = httpsCallable(functions, 'setUserRole');
    const deleteUserAndProfile = httpsCallable(functions, 'deleteUserAndProfile');

    function createUserCard(user, representatives) {
        const cardWrapper = document.createElement('div');
        cardWrapper.className = 'col-md-6 col-lg-4';
        cardWrapper.dataset.uid = user.uid;

        const roleBadges = {
            admin: 'bg-danger',
            reseller: 'bg-info text-dark',
            representatif: 'bg-success',
            produksi: 'bg-warning text-dark',
        };
        const roleBadgeClass = roleBadges[user.role] || 'bg-secondary';

        let repSelectHTML = `<select class="form-select form-select-sm representative-select" ${user.role !== 'reseller' ? 'disabled' : ''}>`;
        repSelectHTML += '<option value="">-- Tidak Ada --</option>';
        representatives.forEach(rep => {
            repSelectHTML += `<option value="${rep.uid}" ${user.representativeId === rep.uid ? 'selected' : ''}>${rep.email}</option>`;
        });
        repSelectHTML += '</select>';

        cardWrapper.innerHTML = `
            <div class="card h-100 shadow-sm">
                <div class="card-header d-flex justify-content-between align-items-center">
                    <h6 class="mb-0 text-truncate" title="${user.email}">${user.email}</h6>
                    <span class="badge ${roleBadgeClass}">${user.role}</span>
                </div>
                <div class="card-body">
                    <div class="mb-3">
                        <label class="form-label-sm">Ubah Peran</label>
                        <select class="form-select form-select-sm role-select" ${user.role === 'admin' ? 'disabled' : ''}>
                            <option value="reseller" ${user.role === 'reseller' ? 'selected' : ''}>Reseller</option>
                            <option value="representatif" ${user.role === 'representatif' ? 'selected' : ''}>Representatif</option>
                            <option value="produksi" ${user.role === 'produksi' ? 'selected' : ''}>Produksi</option>
                            <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin</option>
                        </select>
                    </div>
                    <div class="mb-2">
                        <label class="form-label-sm">Induk Representatif</label>
                        ${repSelectHTML}
                    </div>
                </div>
                <div class="card-footer bg-light">
                    <div class="btn-group w-100" role="group">
                        <button class="btn btn-primary btn-sm save-role-btn" data-email="${user.email}" ${user.role === 'admin' ? 'disabled' : ''}>
                            <i class="bi bi-save"></i> Simpan
                        </button>
                        <button class="btn btn-outline-danger btn-sm delete-user-btn" data-uid="${user.uid}" data-email="${user.email}" ${user.role === 'admin' ? 'disabled' : ''}>
                            <i class="bi bi-trash3"></i> Hapus
                        </button>
                    </div>
                </div>
            </div>
        `;
        return cardWrapper;
    }

    async function loadUserList() {
        userListLoading.classList.remove('d-none');
        userCardGrid.innerHTML = '';
        userCardGrid.appendChild(userListLoading);

        try {
            const usersResult = await listAllUsers();
            const users = usersResult.data;
            const representatives = users.filter(u => u.role === 'representatif');

            const newUserRepSelect = document.getElementById('new-user-representative');
            newUserRepSelect.innerHTML = '<option value="">Pilih Atasan...</option>';
            representatives.forEach(rep => {
                newUserRepSelect.add(new Option(rep.email, rep.uid));
            });

            userCardGrid.innerHTML = '';
            if (users.length === 0) {
                userCardGrid.innerHTML = '<p class="text-muted col-12">Belum ada pengguna.</p>';
            } else {
                users.forEach(user => {
                    const userCard = createUserCard(user, representatives);
                    userCardGrid.appendChild(userCard);
                });
            }

        } catch (error) {
            console.error("Gagal memuat user:", error);
            userCardGrid.innerHTML = `<div class="alert alert-danger col-12">Gagal memuat daftar pengguna.</div>`;
        } finally {
            userListLoading.classList.add('d-none');
        }
    }

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            const idTokenResult = await user.getIdTokenResult(true);
            if (idTokenResult.claims.role === 'admin') {
                adminContent.classList.remove('d-none');
                accessDenied.classList.add('d-none');
                loadUserList();
            } else {
                adminContent.classList.add('d-none');
                accessDenied.classList.remove('d-none');
            }
        }
    });

    newUserRoleSelect.addEventListener('change', (event) => {
        representativeSelectWrapper.style.display = (event.target.value === 'reseller') ? 'block' : 'none';
        document.getElementById('new-user-representative').value = '';
    });

    addUserForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const email = document.getElementById('new-user-email').value;
        const password = document.getElementById('new-user-password').value;
        const role = newUserRoleSelect.value;
        const representativeId = document.getElementById('new-user-representative').value;
        const submitButton = addUserForm.querySelector('button[type="submit"]');

        submitButton.disabled = true;
        submitButton.innerHTML = `<span class="spinner-border spinner-border-sm"></span> Menambah...`;

        try {
            const result = await createNewUser({ email, password, role, representativeId });
            Swal.fire('Berhasil!', result.data.message, 'success');
            addUserForm.reset();
            representativeSelectWrapper.style.display = 'none';
            loadUserList();
        } catch (error) {
            console.error("Gagal menambah user:", error);
            Swal.fire('Gagal', error.message, 'error');
        } finally {
            submitButton.disabled = false;
            submitButton.innerHTML = 'Tambah';
        }
    });

    userCardGrid.addEventListener('click', async (event) => {
        const button = event.target.closest('button');
        if (!button) return;

        const card = button.closest('.col-md-6');
        const email = button.dataset.email;

        if (button.classList.contains('save-role-btn')) {
            button.disabled = true;
            button.innerHTML = `<span class="spinner-border spinner-border-sm"></span> Menyimpan...`;

            const role = card.querySelector('.role-select').value;
            const representativeId = card.querySelector('.representative-select').value;

            try {
                const payload = { email, role, representativeId: role === 'reseller' ? (representativeId || null) : null };
                const result = await setUserRole(payload);
                Swal.fire('Berhasil!', result.data.message, 'success');
            } catch (error) {
                console.error("Gagal mengubah peran:", error);
                Swal.fire('Gagal', error.message, 'error');
            } finally {
                button.disabled = false;
                button.innerHTML = '<i class="bi bi-save"></i> Simpan';
                loadUserList();
            }
        }

        if (button.classList.contains('delete-user-btn')) {
            const { uid } = button.dataset;

            Swal.fire({
                title: `Hapus Pengguna ${email}?`,
                html: `
                    <p class="text-danger">Tindakan ini tidak dapat dibatalkan.</p>
                    <p>Untuk mengonfirmasi, ketik ulang alamat email di bawah ini:</p>
                    <input id="swal-email-confirm" class="swal2-input" placeholder="${email}">
                `,
                icon: 'warning',
                showCancelButton: true,
                confirmButtonText: 'Ya, Hapus',
                cancelButtonText: 'Batal',
                confirmButtonColor: '#d33',
                didOpen: () => {
                    const confirmButton = Swal.getConfirmButton();
                    const emailInput = document.getElementById('swal-email-confirm');
                    confirmButton.disabled = true;

                    emailInput.addEventListener('input', () => {
                        if (emailInput.value.toLowerCase() === email.toLowerCase()) {
                            confirmButton.disabled = false;
                        } else {
                            confirmButton.disabled = true;
                        }
                    });
                },
                preConfirm: async () => {
                    try {
                        await deleteUserAndProfile({ uid, email });
                        return { success: true };
                    } catch (error) {
                        Swal.showValidationMessage(`Gagal menghapus: ${error.message}`);
                    }
                }
            }).then((result) => {
                if (result.isConfirmed && result.value?.success) {
                    Swal.fire('Terhapus!', `Pengguna ${email} telah dihapus.`, 'success');
                    loadUserList();
                }
            });
        }
    });

    userCardGrid.addEventListener('change', (event) => {
        if (event.target.classList.contains('role-select')) {
            const card = event.target.closest('.col-md-6');
            const repSelect = card.querySelector('.representative-select');
            repSelect.disabled = (event.target.value !== 'reseller');
            if (event.target.value !== 'reseller') {
                repSelect.value = '';
            }
        }
    });
});