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

// --- Fungsi Cloud Functions ---
const listAllUsers = httpsCallable(functions, 'listAllUsers');
const createNewUser = httpsCallable(functions, 'createNewUser');
const setUserRole = httpsCallable(functions, 'setUserRole');

// --- Fungsi Utama ---
async function loadUserList() {
    userListLoading.classList.remove('d-none');
    userListTable.classList.add('d-none');
    userListTbody.innerHTML = '';

    try {
        const result = await listAllUsers();
        const users = result.data;

        users.forEach(user => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${user.email}</td>
                <td><span class="badge bg-secondary">${user.role.toUpperCase()}</span></td>
                    <td>
                        <select class="form-select form-select-sm w-auto" ${user.role === 'admin' ? 'disabled' : ''}>
                            <option value="sales" ${user.role === 'sales' ? 'selected' : ''}>Sales</option>
                            <option value="produksi" ${user.role === 'produksi' ? 'selected' : ''}>Produksi</option>
                            <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin</option> </select>
                    </td>
                <td>
                    <button class="btn btn-primary btn-sm save-role-btn" data-email="${user.email}" ${user.role === 'admin' ? 'disabled' : ''}>Simpan</button>
                </td>
            `;
            userListTbody.appendChild(row);
        });
    } catch (error) {
        console.error("Gagal memuat user:", error);
        userListTbody.innerHTML = `<tr><td colspan="4" class="text-danger">Gagal memuat daftar pengguna.</td></tr>`;
    } finally {
        userListLoading.classList.add('d-none');
        userListTable.classList.remove('d-none');
    }
}

// --- Event Listeners ---
onAuthStateChanged(auth, async (user) => {
    if (user) {
        const idTokenResult = await user.getIdTokenResult(true); // Paksa refresh token
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

addUserForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = document.getElementById('new-user-email').value;
    const password = document.getElementById('new-user-password').value;
    const role = document.getElementById('new-user-role').value;

    const submitButton = addUserForm.querySelector('button[type="submit"]');
    submitButton.disabled = true;

    try {
        const result = await createNewUser({ email, password, role });
        alert(result.data.message);
        addUserForm.reset();
        loadUserList(); // Muat ulang daftar user
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
        const email = button.dataset.email;
        const role = button.closest('tr').querySelector('select').value;

        button.disabled = true;
        button.textContent = 'Menyimpan...';

        try {
            const result = await setUserRole({ email, role });
            alert(result.data.message);
            loadUserList(); // Muat ulang daftar user
        } catch (error) {
            console.error("Gagal mengubah peran:", error);
            alert(`Error: ${error.message}`);
        } finally {
            button.disabled = false;
            button.textContent = 'Simpan';
        }
    }
});