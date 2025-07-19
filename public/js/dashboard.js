import { db, auth } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.19.1/firebase-auth.js";
import { collection, query, where, orderBy, getDocs, doc, updateDoc, limit, startAfter } from "https://www.gstatic.com/firebasejs/9.19.1/firebase-firestore.js";

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
let currentUserProfile = null; // Simpan profil pengguna di sini
const PAGE_SIZE = 10; // Jumlah pesanan yang dimuat setiap kali
let lastVisibleDoc = null; // Dokumen terakhir yang terlihat untuk paginasi
let isLoadingMore = false; // Flag untuk mencegah pemuatan ganda
let allDataLoaded = false; // Flag untuk menandai jika semua data sudah dimuat

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
    let primaryButton = '';
    const isCancelable = status === 'new_order';

    // Definisikan tombol batalkan dengan ikon trash dan kondisi disabled
    const cancelButton = `
        <button class="btn btn-outline-danger btn-sm action-btn ${!isCancelable ? 'is-disabled' : ''}" 
                data-id="${docId}" 
                data-display-id="${displayId}" 
                data-next-status="cancelled" 
                title="Batalkan Pesanan">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-trash3-fill" viewBox="0 0 16 16"><path d="M11 1.5v1h3.5a.5.5 0 0 1 0 1h-.538l-.853 10.66A2 2 0 0 1 11.115 16h-6.23a2 2 0 0 1-1.994-1.84L2.038 3.5H1.5a.5.5 0 0 1 0-1H5v-1A1.5 1.5 0 0 1 6.5 0h3A1.5 1.5 0 0 1 11 1.5m-5 0v1h4v-1a.5.5 0 0 0-.5-.5h-3a.5.5 0 0 0-.5.5M4.5 5.029l.5 8.5a.5.5 0 1 0 .998-.06l-.5-8.5a.5.5 0 1 0-.998.06m3.5-.029h.001l.5 8.5a.5.5 0 1 0 .998-.06l-.5-8.5a.5.5 0 1 0-.998.06Zm3.5.029l-.5 8.5a.5.5 0 1 0 .998.06l.5-8.5a.5.5 0 1 0-.998-.06Z"/></svg>
        </button>`;

    switch (status) {
        case 'new_order':
            primaryButton = `<button class="btn btn-primary btn-sm action-btn me-2" data-id="${docId}" data-display-id="${displayId}" data-next-status="in_production">Mulai Produksi</button>`;
            break;
        case 'in_production':
            primaryButton = `<button class="btn btn-info btn-sm action-btn me-2" data-id="${docId}" data-display-id="${displayId}" data-next-status="shipped">Kirim Pesanan</button>`;
            break;
        case 'shipped':
            primaryButton = `<button class="btn btn-success btn-sm action-btn me-2" data-id="${docId}" data-display-id="${displayId}" data-next-status="completed">Selesaikan Pesanan</button>`;
            break;
        default:
            return `<p class="text-muted mb-0">Status Final</p>`;
    }
    return `<div class="btn-group" role="group">${primaryButton}${cancelButton}</div>`;
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

        // --- INI ADALAH LOGIKA UTAMA BERDASARKAN PERAN ---
        if (userProfile.role === 'sales') {
            // Sales hanya melihat pesanan yang dibuatnya sendiri
            queryConstraints.unshift(where("creator.uid", "==", userProfile.uid));
        } else if (userProfile.role === 'representatif') {
            // Representatif melihat semua pesanan dengan ID representatif miliknya
            // (termasuk yang dibuat olehnya dan sales bawahannya)
            queryConstraints.unshift(where("representativeId", "==", userProfile.uid));
        }
        // Admin dan Produksi tidak diberi filter, sehingga melihat semua pesanan

        if (statusFilter !== 'all') {
            queryConstraints.unshift(where("status", "==", statusFilter));
        }

        if (lastVisibleDoc && !isInitialLoad) {
            queryConstraints.push(startAfter(lastVisibleDoc));
        }
        
        const q = query(ordersRef, ...queryConstraints);
        const querySnapshot = await getDocs(q);
        
        if (querySnapshot.empty && isInitialLoad) {
            if (['sales', 'representatif'].includes(userProfile.role)) {
                noOrdersMessage.innerHTML = 'Anda belum memiliki pesanan. Ayo buat penjualan pertama Anda! 🚀';
            } else {
                noOrdersMessage.innerHTML = 'Tidak ada pesanan dengan status ini.';
            }
            noOrdersMessage.classList.remove('d-none');
        } else {
            querySnapshot.forEach((docSnap) => {
                const order = { id: docSnap.id, ...docSnap.data() };

                // Buat ringkasan item pesanan
                let itemsSummaryHtml = '<ul class="list-unstyled order-summary-list">';
                (order.items || []).forEach(item => {
                    itemsSummaryHtml += `<li>- ${item.quantity}x ${item.productType} (${item.size})</li>`;
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
                    <div class="card-footer d-flex justify-content-end align-items-center">
                        <div class="action-buttons">
                            ${(userProfile.role === 'admin' || userProfile.role === 'produksi') ? getActionButtons(order) : ''}
                        </div>
                    </div>
                `;
                ordersContainer.appendChild(card);
            });

            // Update state untuk paginasi berikutnya
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
        const idTokenResult = await user.getIdTokenResult(true); // Paksa refresh untuk data terbaru
        currentUserProfile = {
            uid: user.uid,
            role: idTokenResult.claims.role,
        };

        // Tampilkan tombol "Buat Pesanan" untuk admin, sales, dan representatif
        if (['admin', 'sales', 'representatif'].includes(currentUserProfile.role)) {
            createOrderBtn.classList.remove('d-none');
        }

        // Jalankan fungsi untuk memuat data pesanan
        fetchAndDisplayOrders(true, statusFilterSelect.value, currentUserProfile);
    }
});

// Setup Intersection Observer untuk infinite scroll
const observer = new IntersectionObserver((entries) => {
    // Jika elemen pemicu terlihat dan kita tidak sedang memuat data
    if (entries[0].isIntersecting && !isLoadingMore && !allDataLoaded && currentUserProfile) {
        fetchAndDisplayOrders(false, statusFilterSelect.value, currentUserProfile);
    }
}, {
    root: null, // relatif terhadap viewport
    rootMargin: '0px',
    threshold: 0.1 // picu saat 10% elemen terlihat
});

observer.observe(loadMoreTrigger);

ordersContainer.addEventListener('click', (event) => {
    const targetElement = event.target;

    // Cek apakah target klik adalah tombol aksi atau di dalam tombol aksi
    const actionButton = targetElement.closest('.action-btn');
    const card = targetElement.closest('.dashboard-card');

    if (actionButton) { // Prioritaskan klik pada tombol
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
        // Jika klik pada tombol (aktif atau nonaktif), jangan lakukan navigasi.
    } else if (card) { // Jika tidak ada tombol yang diklik, baru periksa klik pada kartu
        window.location.href = `konfirmasi.html?order_id=${card.dataset.id}`;
    }
});

modalConfirmInput.addEventListener('input', () => {
    const typedValue = modalConfirmInput.value.trim().toLowerCase();
    const expectedValue = confirmStatusChangeBtn.dataset.expectedId.trim().toLowerCase();
    confirmStatusChangeBtn.disabled = typedValue !== expectedValue;
});

statusFilterSelect.addEventListener('change', () => { // Panggil fungsi fetch hanya jika profil pengguna sudah ada
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
        // Validasi tambahan: Cek status terkini sebelum membatalkan
        if (nextStatus === 'cancelled') {
            const orderRef = doc(db, 'orders', docId);
            const orderSnap = await getDoc(orderRef);
            if (orderSnap.exists() && orderSnap.data().status !== 'new_order') {
                statusChangeModal.hide();
                alert('Validasi gagal: Pesanan ini tidak lagi berstatus "Pesanan Baru" dan tidak dapat dibatalkan.');
                fetchAndDisplayOrders(true, statusFilterSelect.value, currentUserProfile); // Muat ulang tampilan
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
