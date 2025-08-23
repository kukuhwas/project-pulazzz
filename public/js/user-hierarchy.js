// public/js/user-hierarchy.js (Versi Final & Benar)

import { auth, functions } from './firebase-config.js';
import { httpsCallable } from "https://www.gstatic.com/firebasejs/9.19.1/firebase-functions.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.19.1/firebase-auth.js";

document.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('user-tree-container');
    const listAllUsers = httpsCallable(functions, 'listAllUsers');

    /**
     * Mengubah daftar pengguna datar menjadi struktur pohon (objek bersarang)
     * berdasarkan `referralId`.
     * @param {Array<Object>} users - Daftar pengguna dari Firestore.
     * @returns {Array<Object>} - Array yang berisi pengguna tingkat atas (roots).
     */
    function buildUserTree(users) {
        const userMap = new Map();
        // Pertama, buat peta semua pengguna berdasarkan UID untuk akses cepat
        users.forEach(user => {
            userMap.set(user.uid, { ...user, children: [] });
        });

        const roots = [];
        // Kedua, susun hierarkinya
        userMap.forEach(user => {
            // --- INI ADALAH PERUBAHAN KUNCI ---
            const parentId = user.referralId; // Gunakan referralId sebagai "Orang Tua"

            if (parentId && userMap.has(parentId)) {
                // Jika punya induk, tambahkan sebagai anak dari induknya
                userMap.get(parentId).children.push(user);
            } else {
                // Jika tidak punya induk (top-level), tambahkan ke root tree
                roots.push(user);
            }
        });

        // Urutkan pengguna tingkat atas berdasarkan nama atau email
        roots.sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email));
        return roots;
    }

    /**
     * Merender struktur pohon pengguna menjadi elemen HTML secara rekursif.
     * @param {Array<Object>} nodes - Array node pengguna (bisa root atau children).
     * @returns {string} - String HTML dari daftar bersarang.
     */
    function renderUserTree(nodes, level = 0) {
        // Tentukan seberapa besar inden per level (dalam pixel)
        const paddingPerLevel = 24;
        const currentPadding = level * paddingPerLevel;

        // Gunakan <ul> untuk level pertama, <div> untuk level selanjutnya agar tidak ada padding/bullet default
        let html = level === 0 ? '<ul class="list-group">' : '';

        nodes.sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email));

        nodes.forEach(node => {
            const roleBadges = {
                admin: 'bg-danger',
                reseller: 'bg-info text-dark',
                representatif: 'bg-success',
                produksi: 'bg-warning text-dark',
            };
            const roleBadgeClass = roleBadges[node.role] || 'bg-secondary';

            // Terapkan padding langsung sebagai inline style
            const style = `style="padding-left: ${currentPadding}px;"`;

            html += `
            <li class="list-group-item">
                <div class="d-flex justify-content-between align-items-center" ${style}>
                    <div>
                        <strong>${node.name || 'Nama Belum Diisi'}</strong>
                        <br>
                        <small class="text-muted">${node.email}</small>
                    </div>
                    <span class="badge ${roleBadgeClass}">${node.role}</span>
                </div>
        `;

            if (node.children && node.children.length > 0) {
                // Panggil rekursif untuk anak-anaknya dengan menaikkan level
                html += renderUserTree(node.children, level + 1);
            }

            html += `</li>`;
        });

        html += level === 0 ? '</ul>' : '';
        return html;
    }

    /**
     * Fungsi utama untuk memuat dan menampilkan data pengguna.
     */
    async function loadUsers() {
        container.innerHTML = `
            <div class="d-flex justify-content-center align-items-center">
                <div class="spinner-border text-primary" role="status">
                    <span class="visually-hidden">Memuat...</span>
                </div>
                <span class="ms-3">Memuat daftar pengguna...</span>
            </div>`;
        try {
            const result = await listAllUsers();
            const users = result.data;
            const tree = buildUserTree(users);
            container.innerHTML = renderUserTree(tree);
        } catch (error) {
            console.error('Gagal mengambil data pengguna:', error);
            container.innerHTML = '<div class="alert alert-danger">Gagal memuat data pengguna.</div>';
        }
    }

    // Memeriksa status login dan peran pengguna sebelum memuat data
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            const token = await user.getIdTokenResult(true);
            if (token.claims.role === 'admin' || token.claims.role === 'representatif') { // Izinkan admin dan representatif
                loadUsers();
            } else {
                container.innerHTML = '<div class="alert alert-danger">Akses ditolak. Hanya admin atau representatif yang dapat melihat halaman ini.</div>';
            }
        } else {
            // Dikelola oleh auth-guard.js, tapi sebagai fallback
            window.location.href = '/login.html';
        }
    });
});