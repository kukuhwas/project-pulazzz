// public/js/konfirmasi.js

import { db, auth, functions } from './firebase-config.js';
import { doc, onSnapshot } from "https://www.gstatic.com/firebasejs/9.19.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.19.1/firebase-auth.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/9.19.1/firebase-functions.js";

document.addEventListener('DOMContentLoaded', () => {

    const printBtn = document.getElementById('print-btn');
    const orderDetailsCard = document.getElementById('order-details-card');
    const confirmationHeader = document.getElementById('confirmation-header');
    const confirmationTitle = document.getElementById('confirmation-title');
    const detailsLoadingIndicator = document.getElementById('details-loading-indicator');
    const detailsContentWrapper = document.getElementById('details-content-wrapper');

    const formatCurrency = (number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(number);

    function displayOrderData(data) {
        document.getElementById('order-display-id').textContent = data.displayId || "Memproses...";
        document.getElementById('creator-email').textContent = data.creator?.email || 'N/A';
        document.getElementById('customer-name').textContent = data.customerInfo.name;
        document.getElementById('customer-phone').textContent = data.customerInfo.phone;
        const date = data.createdAt.toDate();
        document.getElementById('order-date').textContent = date.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
        const addr = data.shippingAddress;
        document.getElementById('shipping-address').textContent = `${addr.fullAddress}, ${addr.district}, ${addr.city}, ${addr.province}`;
        document.getElementById('total-amount').textContent = formatCurrency(data.totalAmount);
        const itemListTbody = document.getElementById('item-list');
        itemListTbody.innerHTML = '';

        data.items.forEach(item => {
            // --- PERBAIKAN DI SINI ---
            // Menampilkan data produk secara terperinci
            const row = `<tr>
                            <td>${item.type || '-'}</td>
                            <td>${item.size || '-'}</td>
                            <td class="text-center">${item.thickness || '-'}</td>
                            <td class="text-center">${item.quantity}</td>
                            <td class="text-end">${formatCurrency(item.subtotal)}</td>
                        </tr>`;
            // --- AKHIR PERBAIKAN ---
            itemListTbody.innerHTML += row;
        });
    }

    async function handlePrintPdf(orderId) {
        if (!orderId) {
            Swal.fire('Error', 'ID Pesanan tidak valid.', 'error');
            return;
        }

        Swal.fire({
            title: 'Membuat Link PDF...',
            text: 'Mohon tunggu sebentar.',
            allowOutsideClick: false,
            didOpen: () => { Swal.showLoading(); }
        });

        try {
            const generatePdfFunction = httpsCallable(functions, 'generateInvoicePdf');
            const result = await generatePdfFunction({ orderId: orderId });

            const { url } = result.data;
            Swal.close();
            window.open(url, '_blank');

        } catch (error) {
            console.error("Gagal membuat link PDF:", error);
            Swal.fire({
                icon: 'error',
                title: 'Oops...',
                text: `Gagal membuat link PDF: ${error.message}`,
            });
        }
    }

    function initializePage() {
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                loadOrderDetails();
            }
        });
    }

    function loadOrderDetails() {
        const params = new URLSearchParams(window.location.search);
        const orderId = params.get('order_id');
        const isNewOrder = params.get('new') === 'true';

        if (isNewOrder) {
            confirmationHeader.classList.add('bg-success');
            confirmationTitle.textContent = '✔ Pesanan Berhasil Dibuat!';
        } else {
            confirmationHeader.classList.add('bg-secondary');
            confirmationTitle.textContent = '📄 Detail Pesanan';
        }

        if (!orderId) {
            orderDetailsCard.innerHTML = `<div class="card-body text-center"><p class="text-danger">ID Pesanan tidak ditemukan.</p></div>`;
            return;
        }

        detailsLoadingIndicator.classList.remove('d-none');
        detailsContentWrapper.classList.add('d-none');

        const orderRef = doc(db, "orders", orderId);

        const unsubscribe = onSnapshot(orderRef, (docSnap) => {
            if (docSnap.exists()) {
                const orderData = docSnap.data();
                displayOrderData(orderData);

                detailsLoadingIndicator.classList.add('d-none');
                detailsContentWrapper.classList.remove('d-none');

                if (orderData.displayId) {
                    unsubscribe();
                }
            } else {
                orderDetailsCard.innerHTML = `<div class="card-body text-center"><p class="text-danger">Pesanan dengan ID ${orderId} tidak ditemukan.</p></div>`;
                unsubscribe();
            }
        }, (error) => {
            console.error("Error getting document:", error);
            orderDetailsCard.innerHTML = `<div class="card-body text-center"><p class="text-danger">Gagal memuat data pesanan. Error: ${error.message}</p></div>`;
            detailsLoadingIndicator.classList.add('d-none');
            detailsContentWrapper.classList.add('d-none');
            unsubscribe();
        });
    }

    printBtn.addEventListener('click', () => {
        const params = new URLSearchParams(window.location.search);
        const orderId = params.get('order_id');
        handlePrintPdf(orderId);
    });

    initializePage();
});