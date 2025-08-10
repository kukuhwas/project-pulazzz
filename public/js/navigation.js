// public/js/navigation.js

import { auth } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.19.1/firebase-auth.js";

const navElement = document.getElementById('main-header');

// Fungsi ini sekarang hanya mengembalikan KONTEN di dalam <nav>
const createLoggedInNavContent = (user, role) => {
    const adminMenu = role === 'admin' ? `<li><a class="dropdown-item" href="/admin.html">Manajemen Pengguna</a></li>` : '';
    const inviteMenu = (role === 'admin' || role === 'representatif' || role === 'reseller') ? `<li><a class="dropdown-item" href="/invite.html">Undang Pengguna</a></li>` : '';

    return `
        <div class="container">
            <a class="navbar-brand d-flex align-items-center" href="/dashboard.html">
                <img src="/assets/logo-pulazzz-putih.png" alt="Logo Pulazzz" class="header-logo me-2">
                <span class="d-none d-sm-inline">Order System</span>
            </a>
            <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#mainNavbar">
                <i class="bi bi-caret-down-fill"></i>
            </button>
            <div class="collapse navbar-collapse" id="mainNavbar">
                <ul class="navbar-nav me-auto mb-2 mb-lg-0">
                    <li class="nav-item"><a class="nav-link" href="/dashboard.html">Dashboard</a></li>
                </ul>
                <div class="d-flex">
                    <div class="dropdown">
                        <button class="btn btn-outline-light dropdown-toggle" type="button" id="userDropdown" data-bs-toggle="dropdown" aria-expanded="false">
                            ${user.email}
                        </button>
                        <ul class="dropdown-menu dropdown-menu-end" aria-labelledby="userDropdown">
                            <li><a class="dropdown-item" href="/profile.html">Profil Saya</a></li>
                            ${adminMenu}
                            ${inviteMenu}
                            <li><hr class="dropdown-divider"></li>
                            <li><button class="dropdown-item" id="logout-btn">Logout</button></li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    `;
};

// Fungsi ini sekarang hanya mengembalikan KONTEN di dalam <nav>
const createLoggedOutNavContent = () => {
    return `
        <div class="container">
            <a class="navbar-brand d-flex align-items-center" href="/login.html">
                <img src="/assets/logo-pulazzz-putih.png" alt="Logo Pulazzz" class="header-logo me-2">
                <span class="d-none d-sm-inline">Order System</span>
            </a>
        </div>
    `;
};

onAuthStateChanged(auth, async (user) => {
    if (user) {
        const idTokenResult = await user.getIdTokenResult(true);
        const role = idTokenResult.claims.role || 'reseller';
        navElement.innerHTML = createLoggedInNavContent(user, role);

        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                signOut(auth).then(() => { window.location.href = '/login.html'; });
            });
        }
        
        // --- PERUBAHAN 2: Tambahkan event listener untuk mengubah ikon saat menu dibuka/tutup ---
        const mainNavbar = document.getElementById('mainNavbar');
        if (mainNavbar) {
            const togglerIcon = document.querySelector('.navbar-toggler i');

            // Saat menu akan ditampilkan
            mainNavbar.addEventListener('show.bs.collapse', () => {
                togglerIcon.classList.remove('bi-caret-down-fill');
                togglerIcon.classList.add('bi-caret-up-fill');
            });

            // Saat menu akan disembunyikan
            mainNavbar.addEventListener('hide.bs.collapse', () => {
                togglerIcon.classList.remove('bi-caret-up-fill');
                togglerIcon.classList.add('bi-caret-down-fill');
            });
        }

    } else {
        navElement.innerHTML = createLoggedOutNavContent();
    }
});


/**
 * Membuat dan menyuntikkan footer ke dalam body dokumen.
 * Fungsi ini sekarang juga menangani padding body untuk mengakomodasi footer yang fixed.
 */
const createAndInjectFooter = () => {
    // Pastikan footer belum ada untuk menghindari duplikasi
    if (document.querySelector('.site-footer')) {
        return;
    }

    const footerElement = document.createElement('footer');
    footerElement.className = 'site-footer';

    const quote = 'Crafted with code, and the good company of a friend called <a href="https://jules.google.com" target="_blank" rel="noopener noreferrer">Jules</a>. — Pulazzz Apz';

    footerElement.innerHTML = `<p class="mb-0">${quote}</p>`;

    document.body.appendChild(footerElement);

    /**
     * Menyesuaikan padding-bottom dari body agar sama dengan tinggi footer.
     * Hal ini mencegah konten terakhir halaman tersembunyi di balik footer.
     */
    const adjustBodyPadding = () => {
        const footerHeight = footerElement.offsetHeight;
        document.body.style.paddingBottom = `${footerHeight}px`;
    };

    // Panggil fungsi penyesuaian padding saat pertama kali footer dibuat
    adjustBodyPadding();

    // Tambahkan event listener untuk menyesuaikan padding jika ukuran jendela berubah
    // (misalnya, jika teks di footer jadi multi-baris dan mengubah tingginya)
    window.addEventListener('resize', adjustBodyPadding);
};

// Panggil fungsi untuk menambahkan footer di setiap halaman yang memuat skrip ini.
createAndInjectFooter();