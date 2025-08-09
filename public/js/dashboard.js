// public/js/dashboard.js

import { db, auth } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.19.1/firebase-auth.js";
import { collection, query, where, orderBy, getDocs, doc, updateDoc, limit, startAfter, getDoc } from "https://www.gstatic.com/firebasejs/9.19.1/firebase-firestore.js";

// --- Referensi Elemen ---
const ordersContainer = document.getElementById('orders-container');
const loadingIndicator = document.getElementById('loading-indicator');
const loadMoreSpinner = document.getElementById('load-more-spinner');
const loadMoreTrigger = document.getElementById('load-more-trigger');
const statusFilterSelect = document.getElementById('status-filter');
const noOrdersMessage = document.getElementById('no-orders-message');
const createOrderBtn = document.getElementById('create-order-btn');
const statusChangeModal = new bootstrap.Modal(document.getElementById('status-change-modal'));
const modalConfirmInput = document.getElementById('modal-confirm-input');
const confirmStatusChangeBtn = document.getElementById('confirm-status-change-btn');

// --- State Aplikasi ---
let currentUserProfile = null;
const PAGE_SIZE = 10;
let lastVisibleDoc = null;
let isLoadingMore = false;
let allDataLoaded = false;

// --- Data & Fungsi Bantuan ---
const statuses = {
    'new_order': 'Pesanan Baru',
    'in_production': 'Dalam Produksi',
    'shipped': 'Dikirim',
    'completed': 'Selesai',
    'cancelled': 'Dibatalkan'
};
const formatCurrency = (number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(number);
const formatDate = (timestamp) => timestamp ? timestamp.toDate().toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A';

const getStatusBadge = (status) => {
    const statusInfo = {
        'new_order': { text: 'Pesanan Baru', class: 'bg-primary' },
        'in_production': { text: 'Dalam Produksi', class: 'bg-warning text-dark' },
        'shipped': { text: 'Dikirim', class: 'bg-info text-dark' },
        'completed': { text: 'Selesai', class: 'bg-success' },
        'cancelled': { text: 'Dibatalkan', class: 'bg-danger' }
    }[status] || { text: status, class: 'bg-secondary' };
    return `<span class="badge ${statusInfo.class}">${statusInfo.text}</span>`;
};


// =================================================================
// --- PERUBAHAN DI SINI: Tombol Aksi Menjadi Dropdown ---
// Fungsi ini diubah dari menampilkan beberapa tombol sejajar
// menjadi satu tombol dropdown "Tindakan" untuk menghemat ruang
// dan menyembunyikan opsi "Batalkan Pesanan" jika tidak lagi tersedia.
// =================================================================
function getActionButtons(order) {
    const { status, displayId, id: docId } = order;
    let primaryActionText = '';
    let primaryActionStatus = '';
    const isCancelable = status === 'new_order';

    switch (status) {
        case 'new_order':
            primaryActionText = 'Mulai Produksi';
            primaryActionStatus = 'in_production';
            break;
        case 'in_production':
            primaryActionText = 'Kirim Pesanan';
            primaryActionStatus = 'shipped';
            break;
        case 'shipped':
            primaryActionText = 'Selesaikan Pesanan';
            primaryActionStatus = 'completed';
            break;
        default:
            return `<p class="text-muted mb-0">Status Final</p>`;
    }

    const primaryActionItem = `
        <li>
            <button class="dropdown-item action-btn" data-id="${docId}" data-display-id="${displayId}" data-next-status="${primaryActionStatus}">
                ${primaryActionText}
            </button>
        </li>`;

    const cancelActionItem = isCancelable ? `
        <li><hr class="dropdown-divider"></li>
        <li>
            <button class="dropdown-item text-danger action-btn" data-id="${docId}" data-display-id="${displayId}" data-next-status="cancelled">
                Batalkan Pesanan
            </button>
        </li>
    ` : '';

    return `
        <div class="dropdown">
            <button class="btn btn-primary btn-sm dropdown-toggle" type="button" data-bs-toggle="dropdown" aria-expanded="false">
                Tindakan
            </button>
            <ul class="dropdown-menu dropdown-menu-end">
                ${primaryActionItem}
                ${cancelActionItem}
            </ul>
        </div>
    `;
}

// --- Logika Utama ---
async function fetchAndDisplayOrders(isInitialLoad, statusFilter = 'all', userProfile) {
    if (isLoadingMore || (allDataLoaded && !isInitialLoad)) return;

    if (isInitialLoad) {
        loadingIndicator.classList.remove('d-none');
        ordersContainer.innerHTML = '';
        noOrdersMessage.classList.add('d-none');
        lastVisibleDoc = null;
        allDataLoaded = false;
    } else {
        isLoadingMore = true;
        loadMoreSpinner.classList.remove('d-none');
    }

    try {
        const ordersRef = collection(db, 'orders');
        let queryConstraints = [orderBy("createdAt", "desc"), limit(PAGE_SIZE)];

        if (userProfile.role === 'reseller') {
            queryConstraints.unshift(where("creator.uid", "==", userProfile.uid));
        } else if (userProfile.role === 'representatif') {
            queryConstraints.unshift(where("representativeId", "==", userProfile.uid));
        }

        if (statusFilter !== 'all') {
            queryConstraints.unshift(where("status", "==", statusFilter));
        }

        if (lastVisibleDoc && !isInitialLoad) {
            queryConstraints.push(startAfter(lastVisibleDoc));
        }

        const q = query(ordersRef, ...queryConstraints);
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty && isInitialLoad) {
            noOrdersMessage.innerHTML = (['reseller', 'representatif'].includes(userProfile.role))
                ? 'Anda belum memiliki pesanan. Ayo buat penjualan pertama Anda! 🚀'
                : 'Tidak ada pesanan dengan status ini.';
            noOrdersMessage.classList.remove('d-none');
        } else {
            querySnapshot.forEach((docSnap) => {
                const order = { id: docSnap.id, ...docSnap.data() };
                let itemsSummaryHtml = '<ul class="list-unstyled order-summary-list">';
                (order.items || []).forEach(item => {
                    itemsSummaryHtml += `<li>- ${item.quantity}x ${item.type} (${item.size}, ${item.thickness} cm)</li>`;
                });
                itemsSummaryHtml += '</ul>';

                const card = document.createElement('div');
                card.classList.add('card', 'mb-3', 'dashboard-card');
                card.dataset.id = order.id;

                card.innerHTML = `
                    <div class="card-header d-flex justify-content-between align-items-center">
                        <strong class="text-primary">${order.displayId || 'N/A'}</strong>
                        ${getStatusBadge(order.status)}
                    </div>
                    <div class="card-body">
                        <div class="row">
                            <div class="col-md-6">
                                <p class="mb-1"><strong>Pelanggan:</strong> ${order.customerInfo.name}</p>
                                <p class="mb-0"><strong>Tgl Pesan:</strong> ${formatDate(order.createdAt)}</p>
                            </div>
                            <div class="col-md-6 text-md-end">
                                <p class="mb-1"><strong>Dibuat Oleh:</strong> ${order.creator?.email || 'N/A'}</p>
                                <p class="mb-0"><strong>Total:</strong> ${formatCurrency(order.totalAmount)}</p>
                            </div>
                            <hr class="my-2">
                            <div class="col-12">${itemsSummaryHtml}</div>
                        </div>
                    </div>
                    <div class="card-footer d-flex justify-content-between align-items-center">
                        <p class="mb-0 text-muted small text-truncate" title="${order.shippingAddress.city}, ${order.shippingAddress.province}">
                            📍 ${order.shippingAddress.city}, ${order.shippingAddress.province}
                        </p>
                        <div class="action-buttons">
                            ${(userProfile.role === 'admin' || userProfile.role === 'produksi') ? getActionButtons(order) : ''}
                        </div>
                    </div>
                `;
                ordersContainer.appendChild(card);
            });

            const lastDocInBatch = querySnapshot.docs[querySnapshot.docs.length - 1];
            if (lastDocInBatch) {
                lastVisibleDoc = lastDocInBatch;
            }

            if (querySnapshot.docs.length < PAGE_SIZE) {
                allDataLoaded = true;
                loadMoreSpinner.classList.add('d-none');
            }
        }
    } catch (error) {
        console.error("Error fetching orders: ", error);
        ordersContainer.innerHTML = `<div class="alert alert-danger">Gagal memuat data.</div>`;
    } finally {
        loadingIndicator.classList.add('d-none');
        loadMoreSpinner.classList.add('d-none');
        isLoadingMore = false;
    }
}

// --- Event Listeners ---
onAuthStateChanged(auth, async (user) => {
    if (user) {
        const idTokenResult = await user.getIdTokenResult(true);
        currentUserProfile = {
            uid: user.uid,
            role: idTokenResult.claims.role,
        };

        if (['admin', 'reseller', 'representatif'].includes(currentUserProfile.role)) {
            createOrderBtn.classList.remove('d-none');
        }

        fetchAndDisplayOrders(true, statusFilterSelect.value, currentUserProfile);
    }
});

const observer = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting && !isLoadingMore && !allDataLoaded && currentUserProfile) {
        fetchAndDisplayOrders(false, statusFilterSelect.value, currentUserProfile);
    }
}, { threshold: 0.1 });

observer.observe(loadMoreTrigger);

// =================================================================
// --- PERUBAHAN DI SINI: Event Listener untuk Klik Kartu ---
// =================================================================
ordersContainer.addEventListener('click', (event) => {
    const targetElement = event.target;

    // Cari elemen terdekat yang relevan dari target klik
    const actionButton = targetElement.closest('.action-btn');
    const footer = targetElement.closest('.card-footer');
    const card = targetElement.closest('.dashboard-card');

    if (actionButton) {
        // Jika yang diklik adalah tombol aksi di dalam dropdown, jalankan logika modal
        if (!actionButton.classList.contains('is-disabled')) {
            const { id: docId, displayId, nextStatus } = actionButton.dataset;
            const nextStatusText = statuses[nextStatus] || nextStatus;

            document.getElementById('modal-order-id').textContent = displayId;
            document.getElementById('modal-next-status').textContent = nextStatusText;

            modalConfirmInput.value = '';
            confirmStatusChangeBtn.disabled = true;
            confirmStatusChangeBtn.dataset.docId = docId;
            confirmStatusChangeBtn.dataset.nextStatus = nextStatus;
            confirmStatusChangeBtn.dataset.expectedId = displayId;
            statusChangeModal.show();
        }
    } else if (card && !footer) {
        // Jika yang diklik adalah kartu, TETAPI BUKAN footer,
        // maka arahkan ke halaman konfirmasi.
        window.location.href = `konfirmasi.html?order_id=${card.dataset.id}`;
    }
    // Jika yang diklik adalah area footer tapi bukan tombol aksi, tidak terjadi apa-apa.
});

modalConfirmInput.addEventListener('input', () => {
    const typedValue = modalConfirmInput.value.trim().toLowerCase();
    const expectedValue = confirmStatusChangeBtn.dataset.expectedId.trim().toLowerCase();
    confirmStatusChangeBtn.disabled = typedValue !== expectedValue;
});

statusFilterSelect.addEventListener('change', () => {
    if (currentUserProfile) {
        fetchAndDisplayOrders(true, statusFilterSelect.value, currentUserProfile);
    }
});

confirmStatusChangeBtn.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    const { docId, nextStatus } = button.dataset;

    button.disabled = true;
    button.textContent = 'Memproses...';

    try {
        if (nextStatus === 'cancelled') {
            const orderRef = doc(db, 'orders', docId);
            const orderSnap = await getDoc(orderRef);
            if (orderSnap.exists() && orderSnap.data().status !== 'new_order') {
                statusChangeModal.hide();
                alert('Validasi gagal: Pesanan ini tidak lagi berstatus "Pesanan Baru" dan tidak dapat dibatalkan.');
                fetchAndDisplayOrders(true, statusFilterSelect.value, currentUserProfile);
                button.disabled = false;
                button.textContent = 'Ya, Ubah Status';
                return;
            }
        }
        await updateDoc(doc(db, 'orders', docId), { status: nextStatus });
        statusChangeModal.hide();
        fetchAndDisplayOrders(true, statusFilterSelect.value, currentUserProfile);
    } catch (error) {
        console.error("Gagal update status:", error);
        alert('Gagal memperbarui status.');
    } finally {
        button.disabled = false;
        button.textContent = 'Ya, Ubah Status';
    }
});