import { db, auth } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.19.1/firebase-auth.js";
import { collection, query, where, orderBy, getDocs, doc, updateDoc } from "https://www.gstatic.com/firebasejs/9.19.1/firebase-firestore.js";

// --- Referensi Elemen ---
const ordersContainer = document.getElementById('orders-container');
const loadingIndicator = document.getElementById('loading-indicator');
const statusFilterSelect = document.getElementById('status-filter');
const noOrdersMessage = document.getElementById('no-orders-message');
const createOrderBtn = document.getElementById('create-order-btn');

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

function getActionButtons(order) {
    const { status, displayId, id: docId } = order;
    let buttons = '';
    const cancelButton = `<button class="btn btn-outline-danger btn-sm action-btn" data-id="${docId}" data-display-id="${displayId}" data-next-status="cancelled">Batalkan</button>`;

    switch (status) {
        case 'new_order':
            buttons = `<button class="btn btn-primary btn-sm action-btn me-2" data-id="${docId}" data-display-id="${displayId}" data-next-status="in_production">Mulai Produksi</button>${cancelButton}`;
            break;
        case 'in_production':
            buttons = `<button class="btn btn-info btn-sm action-btn me-2" data-id="${docId}" data-display-id="${displayId}" data-next-status="shipped">Kirim Pesanan</button>${cancelButton}`;
            break;
        case 'shipped':
            buttons = `<button class="btn btn-success btn-sm action-btn me-2" data-id="${docId}" data-display-id="${displayId}" data-next-status="completed">Selesaikan Pesanan</button>${cancelButton}`;
            break;
        default:
            buttons = `<p class="text-muted mb-0">Status Final</p>`;
    }
    return buttons;
}

// --- Logika Utama ---
async function fetchAndDisplayOrders(statusFilter = 'all', userRole, userId) {
    loadingIndicator.classList.remove('d-none');
    ordersContainer.innerHTML = '';
    noOrdersMessage.classList.add('d-none');

    try {
        const ordersRef = collection(db, 'orders');
        let queryConstraints = [orderBy("createdAt", "desc")];

        if (userRole === 'sales') {
            queryConstraints.unshift(where("creator.uid", "==", userId));
        }
        if (statusFilter !== 'all') {
            queryConstraints.unshift(where("status", "==", statusFilter));
        }
        
        const q = query(ordersRef, ...queryConstraints);
        const querySnapshot = await getDocs(q);
        
        if (querySnapshot.empty) {
            if (userRole === 'sales') {
                noOrdersMessage.innerHTML = 'Anda belum memiliki pesanan. Ayo buat penjualan pertama Anda! 🚀';
            } else {
                noOrdersMessage.innerHTML = 'Tidak ada pesanan dengan status ini.';
            }
            noOrdersMessage.classList.remove('d-none');
        } else {
            querySnapshot.forEach((docSnap) => {
                const order = { id: docSnap.id, ...docSnap.data() };
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
                        </div>
                    </div>
                    <div class="card-footer d-flex justify-content-end align-items-center">
                        <div class="action-buttons">
                            ${(userRole === 'admin' || userRole === 'produksi') ? getActionButtons(order) : ''}
                        </div>
                    </div>
                `;
                ordersContainer.appendChild(card);
            });
        }
    } catch (error) {
        console.error("Error fetching orders: ", error);
        ordersContainer.innerHTML = `<div class="alert alert-danger">Gagal memuat data.</div>`;
    } finally {
        loadingIndicator.classList.add('d-none');
    }
}

// --- Event Listeners ---
onAuthStateChanged(auth, async (user) => {
    if (user) {
        const idTokenResult = await user.getIdTokenResult();
        const userRole = idTokenResult.claims.role;

        // Tampilkan tombol "Buat Pesanan" hanya untuk admin dan sales
        if (userRole === 'admin' || userRole === 'sales') {
            createOrderBtn.classList.remove('d-none');
        }

        // Jalankan fungsi untuk memuat data pesanan
        fetchAndDisplayOrders(statusFilterSelect.value, userRole, user.uid);

        // Atur ulang listener untuk filter status agar membawa info peran
        statusFilterSelect.addEventListener('change', () => {
            fetchAndDisplayOrders(statusFilterSelect.value, userRole, user.uid);
        });
    }
});

ordersContainer.addEventListener('click', async (event) => {
    const actionButton = event.target.closest('.action-btn');

    if (actionButton) {
        const button = actionButton;
        const { id, displayId, nextStatus } = button.dataset;
        const nextStatusText = statuses[nextStatus] || nextStatus;

        const confirmation = prompt(`Untuk mengubah status menjadi "${nextStatusText}", ketik ulang nomor pesanan: ${displayId}`);
        if (confirmation === null) return;

        if (confirmation.trim().toLowerCase() === displayId.toLowerCase()) {
            try {
                button.disabled = true;
                button.textContent = 'Memproses...';
                await updateDoc(doc(db, 'orders', id), { status: nextStatus });

                const idTokenResult = await auth.currentUser.getIdTokenResult();
                fetchAndDisplayOrders(statusFilterSelect.value, idTokenResult.claims.role, auth.currentUser.uid);
            } catch (error) {
                console.error("Gagal update status:", error);
                alert('Gagal memperbarui status.');
                button.disabled = false;
            }
        } else {
            alert('Konfirmasi salah. Perubahan status dibatalkan.');
        }
        return;
    }

    const card = event.target.closest('.dashboard-card');
    if (card && card.dataset.id) {
        window.location.href = `konfirmasi.html?order_id=${card.dataset.id}`;
    }
});