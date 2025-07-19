import { db, auth } from './firebase-config.js';
import { collection, doc, addDoc, serverTimestamp, getDoc, query, where, getDocs } from "https://www.gstatic.com/firebasejs/9.19.1/firebase-firestore.js";

// --- Referensi Elemen & State ---
const orderForm = document.getElementById('order-form');
const customerPhoneInput = document.getElementById('customer-phone');
const provinceSelect = document.getElementById('address-province');
const citySelect = document.getElementById('address-city');
const districtSelect = document.getElementById('address-district');
const productDetailsWrapper = document.getElementById('product-details-wrapper');
const productListTbody = document.getElementById('product-list');
const productSizeSelect = document.getElementById('product-size');
const productQtyInput = document.getElementById('product-qty');
const addProductBtn = document.getElementById('add-product-btn');
const validationModal = new bootstrap.Modal(document.getElementById('validationModal'));
const fullPageLoader = document.getElementById('full-page-loader');

let cartItems = []; // State management untuk produk di keranjang

// --- Validasi Real-time Nomor HP ---
customerPhoneInput.addEventListener('input', (event) => {
    event.target.value = event.target.value.replace(/\D/g, '');
});

// --- Fungsi untuk Mengisi Dropdown Alamat dari Firestore ---
async function populateDropdown(collectionName, selectElement, filterField, filterValue) {
    selectElement.length = 1; // Reset dropdown ke opsi default
    selectElement.disabled = true;
    try {
        let q;
        if (filterField && filterValue) {
            q = query(collection(db, collectionName), where(filterField, "==", filterValue));
        } else {
            q = query(collection(db, collectionName));
        }
        const querySnapshot = await getDocs(q);
        querySnapshot.forEach((doc) => {
            const option = new Option(doc.data().name, doc.id);
            selectElement.add(option);
        });
        if (!querySnapshot.empty) {
            selectElement.disabled = false;
        }
    } catch (error) {
        console.error(`Gagal memuat data ${collectionName}: `, error);
    }
}

// --- Event Listeners untuk Alamat ---
document.addEventListener('DOMContentLoaded', () => {
    populateDropdown('provinces', provinceSelect);
});

provinceSelect.addEventListener('change', (e) => {
    const provinceId = e.target.value;
    citySelect.length = 1; citySelect.disabled = true;
    districtSelect.length = 1; districtSelect.disabled = true;
    if (provinceId) {
        populateDropdown('cities', citySelect, 'provinceId', provinceId);
    }
});

citySelect.addEventListener('change', (e) => {
    const cityId = e.target.value;
    districtSelect.length = 1; districtSelect.disabled = true;
    if (cityId) {
        populateDropdown('districts', districtSelect, 'cityId', cityId);
    }
});

// --- Logika Keranjang Belanja (Cart) ---

function renderProductInTable(item) {
    const rowId = `row-${item.productId}`;
    const existingRow = document.getElementById(rowId);
    if (existingRow) existingRow.remove(); // Hapus baris lama untuk di-render ulang
    
    const newRow = document.createElement('tr');
    newRow.id = rowId;
    newRow.innerHTML = `
        <td>${item.productType}</td>
        <td>${item.size}</td>
        <td class="text-center">${item.quantity}</td>
        <td><button type="button" class="btn btn-danger btn-sm">Hapus</button></td>
    `;
    
    newRow.querySelector('button').addEventListener('click', () => {
        cartItems = cartItems.filter(cartItem => cartItem.productId !== item.productId);
        newRow.remove();
        if (cartItems.length === 0) {
            productDetailsWrapper.classList.add('d-none');
        }
    });
    
    productListTbody.appendChild(newRow);
}

addProductBtn.addEventListener('click', async () => {
    const type = document.querySelector('input[name="product-type"]:checked')?.value;
    const size = productSizeSelect.value;
    const quantity = parseInt(productQtyInput.value);

    if (!type || !size || !quantity || quantity < 1) {
        alert('Harap pilih Jenis Produk, Ukuran, dan Jumlah yang valid.');
        return;
    }

    productDetailsWrapper.classList.remove('d-none');
    const productId = `${type.toLowerCase().replace(' ', '_')}_${size.replace('x', '')}`;

    try {
        const productRef = doc(db, "products", productId);
        const productSnap = await getDoc(productRef);
        if (!productSnap.exists()) {
            alert('Produk tidak ditemukan di database.');
            return;
        }

        const productData = productSnap.data();
        const existingItemIndex = cartItems.findIndex(item => item.productId === productId);

        if (existingItemIndex > -1) {
            // Jika produk sudah ada, update jumlahnya
            cartItems[existingItemIndex].quantity += quantity;
            cartItems[existingItemIndex].subtotal = cartItems[existingItemIndex].quantity * cartItems[existingItemIndex].priceAtPurchase;
            renderProductInTable(cartItems[existingItemIndex]);
        } else {
            // Jika produk baru, tambahkan ke keranjang
            const newCartItem = {
                productId,
                productType: type,
                size,
                quantity,
                priceAtPurchase: productData.price,
                subtotal: productData.price * quantity
            };
            cartItems.push(newCartItem);
            renderProductInTable(newCartItem);
        }

    } catch (error) {
        console.error("Error saat menambahkan produk: ", error);
        alert("Gagal menambahkan produk. Cek console untuk detail.");
    }
});

// --- Logika Submit Form ---
orderForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  event.stopPropagation();

  if (!orderForm.checkValidity()) {
    orderForm.classList.add('was-validated');
    validationModal.show();
    return;
  }

  if (cartItems.length === 0) {
    alert('Keranjang pesanan kosong. Harap tambahkan produk terlebih dahulu.');
    return;
  }
  
  const currentUser = auth.currentUser;
  if (!currentUser) {
    alert("Sesi Anda telah berakhir. Silakan login kembali.");
    window.location.href = 'login.html';
    return;
  }

  // Ambil token untuk mendapatkan custom claims (peran dan ID representatif)
  const idTokenResult = await currentUser.getIdTokenResult();
  const claims = idTokenResult.claims;
  
  fullPageLoader.classList.remove('d-none');

  try {
    const customerName = document.getElementById('customer-name').value;
    const customerPhone = `62${document.getElementById('customer-phone').value}`;
    const paymentMethod = document.querySelector('input[name="paymentMethod"]:checked').nextElementSibling.textContent.trim();
    const shippingAddress = {
        fullAddress: document.getElementById('address-street').value,
        province: provinceSelect.options[provinceSelect.selectedIndex].text,
        city: citySelect.options[citySelect.selectedIndex].text,
        district: districtSelect.options[districtSelect.selectedIndex].text,
    };
    const totalAmount = cartItems.reduce((total, item) => total + item.subtotal, 0);

    // Tentukan nilai untuk field representativeId berdasarkan peran pengguna
    let representativeIdForOrder = null;
    if (claims.role === 'representatif') {
      // Jika yang membuat adalah representatif, gunakan UID-nya sendiri
      representativeIdForOrder = currentUser.uid;
    } else if (claims.role === 'sales' && claims.representativeId) {
      // Jika yang membuat adalah sales, gunakan representativeId dari claims-nya
      representativeIdForOrder = claims.representativeId;
    }

    const orderData = {
        creator: { uid: currentUser.uid, email: currentUser.email },
        customerInfo: { name: customerName, phone: customerPhone },
        shippingAddress: shippingAddress,
        items: cartItems,
        paymentMethod: paymentMethod,
        totalAmount: totalAmount,
        status: 'new_order',
        createdAt: serverTimestamp(),
        representativeId: representativeIdForOrder // Tambahkan field baru ini
    };
    
    const newOrderRef = await addDoc(collection(db, 'orders'), orderData);
    
    window.location.href = `konfirmasi.html?order_id=${newOrderRef.id}&new=true`;

  } catch (error) {
    console.error("Gagal menyimpan pesanan:", error);
    alert('Terjadi kesalahan saat menyimpan pesanan.');
  } finally {
    fullPageLoader.classList.add('d-none');
  }
});
