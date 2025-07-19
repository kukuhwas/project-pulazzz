import { db, auth, functions } from './firebase-config.js';
import { doc, onSnapshot } from "https://www.gstatic.com/firebasejs/9.19.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.19.1/firebase-auth.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/9.19.1/firebase-functions.js";

// --- Referensi Elemen ---
const printBtn = document.getElementById('print-btn');
const sendEmailBtn = document.getElementById('send-email-btn');
const orderDetailsCard = document.getElementById('order-details-card');
const confirmationHeader = document.getElementById('confirmation-header');
const confirmationTitle = document.getElementById('confirmation-title');
const detailsLoadingIndicator = document.getElementById('details-loading-indicator');
const detailsContentWrapper = document.getElementById('details-content-wrapper');

// --- Fungsi Bantuan ---
const formatCurrency = (number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(number);

function displayOrderData(data, userRole) {
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
    const row = `<tr><td>${item.productType}</td><td>${item.size}</td><td class="text-center">${item.quantity}</td><td class="text-end">${formatCurrency(item.subtotal)}</td></tr>`;
    itemListTbody.innerHTML += row;
  });

  // Tampilkan tombol kirim email hanya untuk admin
  if (userRole === 'admin') {
    sendEmailBtn.classList.remove('d-none');
    sendEmailBtn.disabled = false;
  }
}

// --- Fungsi Utama ---
function initializePage() {
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      const idTokenResult = await user.getIdTokenResult();
      const userRole = idTokenResult.claims.role;
      loadOrderDetails(userRole);
    }
  });
}

function loadOrderDetails(userRole) {
  const params = new URLSearchParams(window.location.search);
  const orderId = params.get('order_id');
  const isNewOrder = params.get('new') === 'true';

  // Mengatur judul dan warna header secara dinamis
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
  
  sendEmailBtn.dataset.orderId = orderId;
  
  detailsLoadingIndicator.classList.remove('d-none');
  detailsContentWrapper.classList.add('d-none');

  const orderRef = doc(db, "orders", orderId);

  // Gunakan onSnapshot untuk mendengarkan perubahan secara real-time
  const unsubscribe = onSnapshot(orderRef, (docSnap) => {
    if (docSnap.exists()) {
      const orderData = docSnap.data();
      displayOrderData(orderData, userRole);

      // Sembunyikan loader dan tampilkan konten setelah data pertama diterima
      detailsLoadingIndicator.classList.add('d-none');
      detailsContentWrapper.classList.remove('d-none');

      // Jika displayId sudah ada, berhenti mendengarkan untuk menghemat resource
      if (orderData.displayId) {
        unsubscribe();
      }
    } else {
      orderDetailsCard.innerHTML = `<div class="card-body text-center"><p class="text-danger">Pesanan dengan ID ${orderId} tidak ditemukan.</p></div>`;
      unsubscribe(); // Berhenti mendengarkan jika dokumen tidak ada
    }
  }, (error) => {
    console.error("Error getting document:", error);
    orderDetailsCard.innerHTML = `<div class="card-body text-center"><p class="text-danger">Gagal memuat data pesanan. Error: ${error.message}</p></div>`;
    detailsLoadingIndicator.classList.add('d-none');
    detailsContentWrapper.classList.add('d-none');
    unsubscribe(); // Berhenti mendengarkan jika terjadi error
  });
}

// --- Event Listeners ---
printBtn.addEventListener('click', () => {
  window.print();
});


sendEmailBtn.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    const orderId = button.dataset.orderId;
    if (!orderId) {
        alert('ID Pesanan tidak valid.');
        return;
    }
    button.disabled = true;
    button.textContent = 'Mengirim...';
    try {
        const sendEmailFunction = httpsCallable(functions, 'sendOrderEmail');
        const result = await sendEmailFunction({ orderId: orderId });
        alert('✅ ' + result.data.message);
        button.textContent = '📧 Email Terkirim';
    } catch (error) {
        console.error('Error saat memanggil fungsi email:', error);
        alert('❌ Gagal mengirim email. Silakan cek konsol untuk detail.');
        button.disabled = false;
        button.textContent = '📧 Kirim Email Produksi';
    }
});

document.addEventListener('DOMContentLoaded', initializePage);