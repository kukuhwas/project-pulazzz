import { auth, functions } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.19.1/firebase-auth.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/9.19.1/firebase-functions.js";

// --- Referensi Elemen ---
const adminContent = document.getElementById('admin-content');
const accessDenied = document.getElementById('access-denied');
const userListTbody = document.getElementById('user-list-tbody');
const userListLoading = document.getElementById('user-list-loading');
const userListTable = document.getElementById('user-list-table');
const addUserForm = document.getElementById('add-user-form');
const newUserRoleSelect = document.getElementById('new-user-role');
const representativeSelectWrapper = document.getElementById('representative-select-wrapper');

// --- Fungsi Cloud Functions ---
const listAllUsers = httpsCallable(functions, 'listAllUsers');
const createNewUser = httpsCallable(functions, 'createNewUser');
const setUserRole = httpsCallable(functions, 'setUserRole');
const sendPasswordReset = httpsCallable(functions, 'sendPasswordReset');

// --- Fungsi Bantuan ---

/**
 * Mengisi elemen <select> dengan daftar representatif.
 * @param {HTMLSelectElement} selectElement - Elemen dropdown yang akan diisi.
 * @param {Array} representatives - Array objek pengguna yang berperan sebagai representatif.
 * @param {string|null} selectedId - UID representatif yang harus dipilih secara default.
 */
function populateRepresentativeDropdown(selectElement, representatives, selectedId = null) {
    selectElement.innerHTML = '<option value="">-- Tidak Ada --</option>'; // Opsi default
    representatives.forEach(rep => {
        const option = new Option(rep.email, rep.uid);
        if (rep.uid === selectedId) {
            option.selected = true;
        }
        selectElement.add(option);
    });
}

// --- Fungsi Utama ---

async function loadUserList() {
    userListLoading.classList.remove('d-none');
    userListTable.classList.add('d-none');
    userListTbody.innerHTML = '';

    try {
        const usersResult = await listAllUsers();
        const users = usersResult.data;

        // Pisahkan pengguna yang berperan sebagai representatif
        const representatives = users.filter(u => u.role === 'representatif');
        
        // Isi dropdown di form "Tambah Pengguna"
        const newUserRepSelect = document.getElementById('new-user-representative');
        populateRepresentativeDropdown(newUserRepSelect, representatives);

        users.forEach(user => {
            const row = document.createElement('tr');
            row.dataset.uid = user.uid;

            // Buat HTML untuk dropdown peran
            const roleSelectHTML = `
                <select class="form-select form-select-sm role-select" ${user.role === 'admin' ? 'disabled' : ''}>
                    <option value="sales" ${user.role === 'sales' ? 'selected' : ''}>Sales</option>
                    <option value="representatif" ${user.role === 'representatif' ? 'selected' : ''}>Representatif</option>
                    <option value="produksi" ${user.role === 'produksi' ? 'selected' : ''}>Produksi</option>
                    <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin</option>
                </select>`;
            
            // Buat HTML untuk dropdown atasan
            const repSelectHTML = `<select class="form-select form-select-sm representative-select" ${user.role !== 'sales' ? 'disabled' : ''}></select>`;

            row.innerHTML = `
                <td>${user.email}</td>
                <td>${roleSelectHTML}</td>
                <td>${repSelectHTML}</td>
                <td>
                    <div class="btn-group" role="group">
                        <button class="btn btn-primary btn-sm save-role-btn" data-email="${user.email}" ${user.role === 'admin' ? 'disabled' : ''}>Simpan</button>
                        <button class="btn btn-warning btn-sm reset-password-btn" data-email="${user.email}">Reset Pass</button>
                    </div>
                </td>
            `;
            userListTbody.appendChild(row);

            // Isi dropdown representatif untuk baris ini secara spesifik
            const repSelectInRow = row.querySelector('.representative-select');
            populateRepresentativeDropdown(repSelectInRow, representatives, user.representativeId);
        });
    } catch (error) {
        console.error("Gagal memuat user:", error);
        userListTbody.innerHTML = `<tr><td colspan="4" class="text-danger text-center">Gagal memuat daftar pengguna.</td></tr>`;
    } finally {
        userListLoading.classList.add('d-none');
        userListTable.classList.remove('d-none');
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
    if (event.target.value === 'sales') {
        representativeSelectWrapper.style.display = 'block';
    } else {
        representativeSelectWrapper.style.display = 'none';
        document.getElementById('new-user-representative').value = ''; // Reset pilihan
    }
});

addUserForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = document.getElementById('new-user-email').value;
    const password = document.getElementById('new-user-password').value;
    const role = newUserRoleSelect.value;
    const representativeId = document.getElementById('new-user-representative').value;

    const submitButton = addUserForm.querySelector('button[type="submit"]');
    submitButton.disabled = true;

    try {
        // Selalu kirim representativeId. Jika tidak dipilih, nilainya akan string kosong ("").
        const result = await createNewUser({ email, password, role, representativeId });
        alert(result.data.message);
        addUserForm.reset();
        representativeSelectWrapper.style.display = 'none'; // Sembunyikan lagi
        loadUserList();
    } catch (error) {
        console.error("Gagal menambah user:", error);
        alert(`Error: ${error.message}`);
    } finally {
        submitButton.disabled = false;
    }
});

userListTbody.addEventListener('click', async (event) => {
    if (event.target.classList.contains('save-role-btn')) {
        const button = event.target;
        const row = button.closest('tr');
        const email = button.dataset.email;
        const role = row.querySelector('.role-select').value;
        const representativeId = row.querySelector('.representative-select').value;

        button.disabled = true;
        button.textContent = 'Menyimpan...';

        try {
            const payload = { email, role };
            if (role === 'sales') {
                payload.representativeId = representativeId || null;
            }
            const result = await setUserRole(payload);
            alert(result.data.message);
            loadUserList();
        } catch (error) {
            console.error("Gagal mengubah peran:", error);
            alert(`Error: ${error.message}`);
            button.disabled = false;
            button.textContent = 'Simpan';
        }
    }

    if (event.target.classList.contains('reset-password-btn')) {
        const button = event.target;
        const email = button.dataset.email;

        if (confirm(`Anda yakin ingin mengirim link reset password ke ${email}?`)) {
            button.disabled = true;
            button.textContent = 'Mengirim...';
            try {
                const result = await sendPasswordReset({ email });
                alert(result.data.message);
            } catch (error) {
                console.error("Gagal mengirim reset password:", error);
                alert(`Error: ${error.message}`);
            } finally {
                button.disabled = false;
                button.textContent = 'Reset Pass';
            }
        }
    }
});

userListTbody.addEventListener('change', (event) => {
    if (event.target.classList.contains('role-select')) {
        const row = event.target.closest('tr');
        const repSelect = row.querySelector('.representative-select');
        const isSales = event.target.value === 'sales';
        
        repSelect.disabled = !isSales;
        if (!isSales) {
            repSelect.value = ''; // Reset pilihan jika bukan sales
        }
    }
});
