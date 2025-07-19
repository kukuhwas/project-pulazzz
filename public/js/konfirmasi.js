import { db, auth, functions } from './firebase-config.js';
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/9.19.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.19.1/firebase-auth.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/9.19.1/firebase-functions.js";

// --- Referensi Elemen ---
const printBtn = document.getElementById('print-btn');
const sendEmailBtn = document.getElementById('send-email-btn');
const orderDetailsCard = document.getElementById('order-details-card');
const confirmationHeader = document.getElementById('confirmation-header');
const confirmationTitle = document.getElementById('confirmation-title');

// --- Fungsi Bantuan ---
const formatCurrency = (number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(number);

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

async function loadOrderDetails(userRole) {
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

  try {
    const orderRef = doc(db, "orders", orderId);
    const orderSnap = await getDoc(orderRef);

    if (orderSnap.exists()) {
      const orderData = orderSnap.data();
      
      const displayData = (data) => {
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
      };
      
      // Menangani jeda waktu (race condition) untuk displayId
      if (!orderData.displayId) {
        setTimeout(async () => {
          const updatedSnap = await getDoc(orderRef);
          if (updatedSnap.exists()) displayData(updatedSnap.data());
        }, 1500);
      } else {
        displayData(orderData);
      }
    } else { 
      orderDetailsCard.innerHTML = `<div class="card-body text-center"><p class="text-danger">Pesanan dengan ID ${orderId} tidak ditemukan.</p></div>`;
    }
  } catch (error) {
    console.error("Error getting document:", error);
    orderDetailsCard.innerHTML = `<div class="card-body text-center"><p class="text-danger">Gagal memuat data pesanan. Error: ${error.message}</p></div>`;
  }
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