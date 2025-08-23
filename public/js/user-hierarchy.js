// public/js/user-hierarchy.js

import { auth, functions } from './firebase-config.js';
import { httpsCallable } from "https://www.gstatic.com/firebasejs/9.19.1/firebase-functions.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.19.1/firebase-auth.js";

document.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('user-tree-container');
    const listAllUsers = httpsCallable(functions, 'listAllUsers');

    function buildUserTree(users) {
        const map = {};
        users.forEach(u => { map[u.uid] = { ...u, children: [] }; });
        const roots = [];
        users.forEach(u => {
            if (u.representativeId && map[u.representativeId]) {
                map[u.representativeId].children.push(map[u.uid]);
            } else {
                roots.push(map[u.uid]);
            }
        });
        return roots;
    }

    function renderUserTree(nodes) {
        const ul = document.createElement('ul');
        ul.className = 'list-unstyled';
        nodes.forEach(node => {
            const li = document.createElement('li');
            li.textContent = `${node.email} (${node.role})`;
            if (node.children.length > 0) {
                const child = renderUserTree(node.children);
                child.classList.add('ms-4');
                li.appendChild(child);
            }
            ul.appendChild(li);
        });
        return ul;
    }

    async function loadUsers() {
        container.innerHTML = '<p>Memuat...</p>';
        try {
            const result = await listAllUsers();
            const users = result.data;
            const tree = buildUserTree(users);
            container.innerHTML = '';
            container.appendChild(renderUserTree(tree));
        } catch (error) {
            console.error('Gagal mengambil data pengguna:', error);
            container.innerHTML = '<p class="text-danger">Gagal memuat data pengguna.</p>';
        }
    }

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            const token = await user.getIdTokenResult(true);
            if (token.claims.role === 'admin') {
                loadUsers();
            } else {
                container.innerHTML = '<p class="text-danger">Akses ditolak.</p>';
            }
        } else {
            container.innerHTML = '<p>Anda harus login.</p>';
        }
    });
});
