// public/js/navigation.js

import { auth } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.19.1/firebase-auth.js";

const headerElement = document.getElementById('main-header');

const createLoggedInHeader = (user, role) => {
    const adminMenu = role === 'admin' ? `
        <li><a class="dropdown-item" href="/admin.html">Manajemen Pengguna</a></li>
    ` : '';

    const inviteMenu = (role === 'admin' || role === 'representatif') ? `
        <li><a class="dropdown-item" href="/invite.html">Undang Pengguna</a></li>
    ` : '';

    return `
        <nav class="navbar navbar-expand-lg navbar-dark header-bg shadow-sm">
            <div class="container">
                <a class="navbar-brand d-flex align-items-center" href="/index.html">
                    <img src="/assets/logo-pulazzz-putih.png" alt="Logo Pulazzz" class="header-logo me-2">
                    <span class="d-none d-sm-inline">Order System</span>
                </a>
                <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#mainNavbar">
                    <i class="bi bi-caret-down"></i>
                </button>
                <div class="collapse navbar-collapse" id="mainNavbar">
                    <ul class="navbar-nav me-auto mb-2 mb-lg-0">
                        <li class="nav-item">
                            <a class="nav-link" href="/dashboard.html">Dashboard</a>
                        </li>
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
        </nav>
    `;
};

const createLoggedOutHeader = () => {
    return `
        <nav class="navbar navbar-dark header-bg shadow-sm">
            <div class="container">
                <a class="navbar-brand d-flex align-items-center" href="#">
                    <img src="/assets/logo-pulazzz-putih.png" alt="Logo Pulazzz" class="header-logo me-2">
                    <span class="d-none d-sm-inline">Order System</span>
                </a>
            </div>
        </nav>
    `;
};

onAuthStateChanged(auth, async (user) => {
    if (user) {
        const idTokenResult = await user.getIdTokenResult(true);
        const role = idTokenResult.claims.role || 'sales';
        headerElement.innerHTML = createLoggedInHeader(user, role);

        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                signOut(auth).then(() => {
                    window.location.href = '/login.html';
                });
            });
        }
    } else {
        headerElement.innerHTML = createLoggedOutHeader();
    }
});