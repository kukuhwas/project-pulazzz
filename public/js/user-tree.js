// public/js/user-tree.js

import { auth, functions } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.19.1/firebase-auth.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/9.19.1/firebase-functions.js";

document.addEventListener('DOMContentLoaded', () => {

    // --- Referensi Elemen ---
    const adminContent = document.getElementById('admin-content');
    const accessDenied = document.getElementById('access-denied');
    const userTreeContainer = document.getElementById('user-tree-container');
    const userTreeLoading = document.getElementById('user-tree-loading');

    // --- Fungsi Cloud Functions ---
    const listAllUsers = httpsCallable(functions, 'listAllUsers');

    // --- Fungsi Logika Pohon ---

    /**
     * Mengubah daftar pengguna datar menjadi struktur pohon hierarkis.
     * @param {Array} users - Daftar objek pengguna dari Firestore.
     * @returns {Array} - Array node pohon root.
     */
    function buildTree(users) {
        const tree = [];
        const nodes = {};

        // Pass pertama: inisialisasi setiap pengguna sebagai node
        users.forEach(user => {
            nodes[user.uid] = { ...user, children: [] };
        });

        // Pass kedua: hubungkan node anak ke induknya
        Object.values(nodes).forEach(node => {
            if (node.referralId && nodes[node.referralId]) {
                nodes[node.referralId].children.push(node);
            } else {
                // Jika tidak ada referralId atau referralId tidak valid, anggap sebagai root
                tree.push(node);
            }
        });

        return tree;
    }

    /**
     * Secara rekursif merender struktur pohon menjadi HTML.
     * @param {Array} nodes - Array node pohon untuk dirender.
     * @returns {string} - String HTML dari daftar bersarang.
     */
    function renderTree(nodes) {
        if (!nodes || nodes.length === 0) return '';

        let html = '<ul class="user-tree">';
        nodes.forEach(node => {
            const hasChildren = node.children.length > 0;
            const userName = node.role === 'representatif' ? `<strong>${node.name}</strong>` : node.name;

            html += `<li data-uid="${node.uid}">`;
            html += `<span class="tree-node ${hasChildren ? 'collapsible' : ''}">`;
            if (hasChildren) {
                html += '<i class="bi bi-caret-right-fill me-1"></i>';
            }
            html += `${userName} <span class="text-muted small">(${node.email} - ${node.role})</span>`;
            html += '</span>';

            if (hasChildren) {
                html += renderTree(node.children);
            }
            html += '</li>';
        });
        html += '</ul>';

        return html;
    }


    // --- Fungsi Utama ---
    async function loadUserTree() {
        userTreeLoading.classList.remove('d-none');
        userTreeContainer.innerHTML = '';
        userTreeContainer.appendChild(userTreeLoading);

        try {
            const result = await listAllUsers();
            const users = result.data;

            if (users.length === 0) {
                userTreeContainer.innerHTML = '<p class="text-muted">Belum ada pengguna untuk ditampilkan.</p>';
                return;
            }

            const userTree = buildTree(users);
            const treeHtml = renderTree(userTree);
            userTreeContainer.innerHTML = treeHtml;

        } catch (error) {
            console.error("Gagal memuat diagram pohon:", error);
            userTreeContainer.innerHTML = `<div class="alert alert-danger">Gagal memuat data pengguna. Silakan coba lagi nanti.</div>`;
            Swal.fire('Error', 'Gagal mengambil data pengguna: ' + error.message, 'error');
        } finally {
            userTreeLoading.classList.add('d-none');
        }
    }

    // --- Event Listener untuk Pohon ---
    userTreeContainer.addEventListener('click', (event) => {
        const target = event.target;
        // Cek jika yang diklik adalah ikon caret atau span node itu sendiri
        if (target.matches('.collapsible, .collapsible i')) {
            const node = target.closest('li');
            node.classList.toggle('expanded');

            // Ubah ikon
            const icon = node.querySelector('.bi');
            if (icon) {
                icon.classList.toggle('bi-caret-right-fill');
                icon.classList.toggle('bi-caret-down-fill');
            }
        }
    });


    // --- Penjaga Otentikasi ---
    onAuthStateChanged(auth, async (user) => {
        const mainSpinner = document.querySelector('#main-header .spinner-border');
        if (user) {
            try {
                const idTokenResult = await user.getIdTokenResult(true);
                if (idTokenResult.claims.role === 'admin') {
                    adminContent.classList.remove('d-none');
                    accessDenied.classList.add('d-none');
                    loadUserTree(); // Panggil fungsi untuk memuat pohon pengguna
                } else {
                    adminContent.classList.add('d-none');
                    accessDenied.classList.remove('d-none');
                }
            } catch (error) {
                console.error("Error verifying user role:", error);
                adminContent.classList.add('d-none');
                accessDenied.classList.remove('d-none');
                Swal.fire('Error', 'Gagal memverifikasi peran pengguna.', 'error');
            }
        } else {
            // Jika tidak ada pengguna yang login, sembunyikan konten admin
            adminContent.classList.add('d-none');
            accessDenied.classList.remove('d-none');
        }
        // Sembunyikan spinner di header setelah pemeriksaan selesai
        if(mainSpinner) mainSpinner.classList.add('d-none');
    });
});
