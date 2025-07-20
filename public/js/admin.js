// public/js/admin.js
console.log('DEBUG: File admin.js mulai dieksekusi.');

import { auth, functions } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.19.1/firebase-auth.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/9.19.1/firebase-functions.js";

// Tunggu hingga seluruh dokumen HTML selesai dimuat
document.addEventListener('DOMContentLoaded', () => {

    console.log('DEBUG: Event DOMContentLoaded telah aktif.');
    console.log('DEBUG: Mencari #user-card-grid dari dalam DOMContentLoaded:', document.getElementById('user-card-grid'));


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
    const sendPasswordReset = httpsCallable(functions, 'sendPasswordReset');

    /**
     * Membuat dan mengembalikan elemen HTML untuk satu kartu pengguna.
     * @param {object} user - Objek pengguna dari Firestore.
     * @param {Array} representatives - Daftar semua pengguna yang berperan sebagai representatif.
     * @returns {HTMLElement} - Elemen div yang berisi kartu pengguna.
     */
    function createUserCard(user, representatives) {
        const cardWrapper = document.createElement('div');
        cardWrapper.className = 'col-md-6 col-lg-4';
        cardWrapper.dataset.uid = user.uid;

        const roleBadges = {
            admin: 'bg-danger',
            sales: 'bg-info text-dark',
            representatif: 'bg-success',
            produksi: 'bg-warning text-dark',
        };
        const roleBadgeClass = roleBadges[user.role] || 'bg-secondary';

        let repSelectHTML = `<select class="form-select form-select-sm representative-select" ${user.role !== 'sales' ? 'disabled' : ''}>`;
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
                            <option value="sales" ${user.role === 'sales' ? 'selected' : ''}>Sales</option>
                            <option value="representatif" ${user.role === 'representatif' ? 'selected' : ''}>Representatif</option>
                            <option value="produksi" ${user.role === 'produksi' ? 'selected' : ''}>Produksi</option>
                            <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin</option>
                        </select>
                    </div>
                    <div class="mb-2">
                        <label class="form-label-sm">Atasan (Rep.)</label>
                        ${repSelectHTML}
                    </div>
                </div>
                <div class="card-footer bg-light">
                    <div class="btn-group w-100" role="group">
                        <button class="btn btn-primary btn-sm save-role-btn" data-email="${user.email}" ${user.role === 'admin' ? 'disabled' : ''}>
                            <i class="bi bi-save"></i> Simpan
                        </button>
                        <button class="btn btn-outline-secondary btn-sm reset-password-btn" data-email="${user.email}">
                            <i class="bi bi-key"></i> Reset Pass
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

    // --- Event Listeners ---
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
        representativeSelectWrapper.style.display = (event.target.value === 'sales') ? 'block' : 'none';
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
                const payload = { email, role, representativeId: role === 'sales' ? (representativeId || null) : null };
                const result = await setUserRole(payload);
                Swal.fire('Berhasil!', result.data.message, 'success');
            } catch (error) {
                console.error("Gagal mengubah peran:", error);
                Swal.fire('Gagal', error.message, 'error');
            } finally {
                // Tidak perlu disable button selamanya
                button.disabled = false;
                button.innerHTML = '<i class="bi bi-save"></i> Simpan';
                loadUserList();
            }
        }

        if (button.classList.contains('reset-password-btn')) {
            const result = await Swal.fire({
                title: 'Kirim Reset Password?',
                text: `Link untuk mereset password akan dikirim ke ${email}.`,
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#3085d6',
                cancelButtonColor: '#d33',
                confirmButtonText: 'Ya, kirim!',
                cancelButtonText: 'Batal'
            });

            if (result.isConfirmed) {
                button.disabled = true;
                button.innerHTML = `<span class="spinner-border spinner-border-sm"></span> Mengirim...`;
                try {
                    const res = await sendPasswordReset({ email });
                    Swal.fire('Terkirim!', res.data.message, 'success');
                } catch (error) {
                    console.error("Gagal mengirim reset password:", error);
                    Swal.fire('Gagal', error.message, 'error');
                } finally {
                    button.disabled = false;
                    button.innerHTML = '<i class="bi bi-key"></i> Reset Pass';
                }
            }
        }
    });

    userCardGrid.addEventListener('change', (event) => {
        if (event.target.classList.contains('role-select')) {
            const card = event.target.closest('.col-md-6');
            const repSelect = card.querySelector('.representative-select');
            repSelect.disabled = (event.target.value !== 'sales');
            if (event.target.value !== 'sales') {
                repSelect.value = '';
            }
        }
    });

}); // Akhir dari DOMContentLoaded