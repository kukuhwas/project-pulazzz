// public/js/form-pemesanan.js

import { db, auth, functions } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.19.1/firebase-auth.js";
import { collection, getDocs, doc } from "https://www.gstatic.com/firebasejs/9.19.1/firebase-firestore.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/9.19.1/firebase-functions.js";

// --- Referensi Cloud Functions ---
const findProfileByPhone = httpsCallable(functions, 'findProfileByPhone');
const createOrder = httpsCallable(functions, 'createOrderAndProfile');
const searchAddress = httpsCallable(functions, 'searchAddress');

document.addEventListener('DOMContentLoaded', () => {

    // --- Referensi Elemen & State ---
    const orderForm = document.getElementById('order-form');
    const customerNameInput = document.getElementById('customer-name');
    const customerPhoneInput = document.getElementById('customer-phone');
    const addressStreetInput = document.getElementById('address-street');
    const fullPageLoader = document.getElementById('full-page-loader');
    const addressSearchSelect = document.getElementById('address-search');
    const hiddenProvinceInput = document.getElementById('address-province');
    const hiddenCityInput = document.getElementById('address-city');
    const hiddenDistrictInput = document.getElementById('address-district');
    const productDetailsWrapper = document.getElementById('product-details-wrapper');
    const productListTbody = document.getElementById('product-list');
    const productSelectionCard = document.getElementById('product-selection-card');
    const addProductBtn = document.getElementById('add-product-btn');
    const validationModal = new bootstrap.Modal(document.getElementById('validationModal'));
    const orderSummaryDiv = document.getElementById('order-summary');
    const adminCustomOption = document.getElementById('admin-custom-option');
    const customNoteWrapper = document.getElementById('custom-note-wrapper');
    const productTypeRadios = document.querySelectorAll('.product-type-radio');
    const standardProductInputs = document.querySelectorAll('.standard-product-inputs');

    let productMasterMap = new Map();
    let cartItems = [];
    let currentUserRole = null;
    let shouldUpdateProfile = true; // Default: selalu update/buat profil baru

    const formatCurrency = (num) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(num);

    // --- Fungsi untuk memperbarui ringkasan pesanan ---
    function updateOrderSummary() {
        if (cartItems.length === 0) {
            orderSummaryDiv.classList.add('d-none');
            return;
        }
        const totalAmount = cartItems.reduce((sum, item) => sum + item.subtotal, 0);
        orderSummaryDiv.innerHTML = `
            <h5 class="mb-3">Ringkasan Pesanan</h5>
            <ul class="list-group mb-3">
                <li class="list-group-item d-flex justify-content-between lh-sm">
                    <div>
                        <h6 class="my-0">Total Harga</h6>
                        <small class="text-muted">${cartItems.length} jenis produk</small>
                    </div>
                    <span class="text-muted"><strong>${formatCurrency(totalAmount)}</strong></span>
                </li>
            </ul>
        `;
        orderSummaryDiv.classList.remove('d-none');
    }

    // --- LOGIKA KERANJANG BELANJA ---
    function renderProductInTable(item) {
        const rowId = `row-${item.productId}`;
        const existingRow = document.getElementById(rowId);
        if (existingRow) existingRow.remove();

        const newRow = document.createElement('tr');
        newRow.id = rowId;
        const productDescription = item.type === 'Custom'
            ? `<strong>Produk Kustom</strong><br><small class="text-muted">${item.customNote}</small>`
            : `${item.type} ${item.size} (${item.thickness} cm)`;

        newRow.innerHTML = `
            <td>${productDescription}</td>
            <td class="text-center">${item.quantity}</td>
            <td><button type="button" class="btn btn-danger btn-sm">Hapus</button></td>
        `;
        newRow.querySelector('button').addEventListener('click', () => {
            cartItems = cartItems.filter(cartItem => cartItem.productId !== item.productId);
            newRow.remove();
            if (cartItems.length === 0) {
                productDetailsWrapper.classList.add('d-none');
            }
            updateOrderSummary();
        });
        productListTbody.appendChild(newRow);
        updateOrderSummary();
    }

    // --- Fungsi untuk Memuat Data Produk ---
    async function loadProducts() {
        productSelectionCard.style.opacity = '0.5';
        const formElements = productSelectionCard.querySelectorAll('input, select, button');
        formElements.forEach(el => el.disabled = true);

        try {
            const productsCollection = collection(db, 'products');
            const productSnapshot = await getDocs(productsCollection);
            productSnapshot.forEach(doc => {
                productMasterMap.set(doc.id, doc.data());
            });
        } catch (error) {
            console.error("Gagal memuat data master produk:", error);
            Swal.fire('Error', 'Gagal memuat data produk. Coba muat ulang halaman.', 'error');
        } finally {
            productSelectionCard.style.opacity = '1';
            formElements.forEach(el => el.disabled = false);
        }
    }

    // --- LOGIKA PENCARIAN ALAMAT ---
    function initializeAddressSearch() {
        const tomSelect = new TomSelect(addressSearchSelect, {
            valueField: 'id',
            labelField: 'text',
            searchField: 'text',
            create: false,
            placeholder: 'Ketik min. 3 huruf nama kecamatan/kota...',
            render: {
                item: (data, escape) => `<div>${escape(data.district)}, ${escape(data.city)}, ${escape(data.province)}</div>`,
                option: (data, escape) => `<div><strong class="d-block">${escape(data.district)}</strong><small class="text-muted">${escape(data.city)}, ${escape(data.province)}</small></div>`,
            },
            load: (query, callback) => {
                if (query.length < 3) return callback();
                searchAddress({ query: query })
                    .then(result => callback(result.data))
                    .catch(error => {
                        console.error("Gagal mencari alamat:", error);
                        callback([]);
                    });
            }
        });
        tomSelect.on('change', (value) => {
            const selectedData = tomSelect.options[value];
            if (selectedData) {
                hiddenProvinceInput.value = selectedData.province;
                hiddenCityInput.value = selectedData.city;
                hiddenDistrictInput.value = selectedData.district;
            }
        });
    }

    // --- FUNGSI HELPER TELEPON ---
    function formatPhoneForDisplay(inputElement) {
        let value = inputElement.value.replace(/\D/g, '');
        if (value.startsWith('62')) { value = value.substring(2); }
        if (value.startsWith('0')) { value = value.substring(1); }
        inputElement.value = value;
    }

    customerPhoneInput.addEventListener('input', (event) => { event.target.value = event.target.value.replace(/\D/g, ''); });

    customerPhoneInput.addEventListener('blur', async () => {
        formatPhoneForDisplay(customerPhoneInput);
        const phone = customerPhoneInput.value;
        if (phone.length < 9) return;

        try {
            const result = await findProfileByPhone({ phone });
            const existingProfile = result.data;

            if (existingProfile) {
                const newName = customerNameInput.value;
                const newAddress = addressStreetInput.value;

                const { isConfirmed } = await Swal.fire({
                    title: 'Pelanggan Ditemukan!',
                    html: `
                        <p>Pelanggan dengan No. HP ini sudah terdaftar. Apakah Anda ingin memperbarui datanya?</p>
                        <div class="text-start p-2 border rounded bg-light">
                            <strong>Data Lama:</strong> ${existingProfile.name}, ${existingProfile.address}<br>
                            <strong>Data Baru:</strong> ${newName || '(kosong)'}, ${newAddress || '(kosong)'}
                        </div>`,
                    icon: 'question',
                    showCancelButton: true,
                    confirmButtonText: 'Ya, Update Data',
                    cancelButtonText: 'Tidak, Gunakan Data Lama'
                });

                shouldUpdateProfile = isConfirmed;
                if (!isConfirmed) {
                    customerNameInput.value = existingProfile.name;
                    addressStreetInput.value = existingProfile.address;
                }
            } else {
                shouldUpdateProfile = true;
            }
        } catch (error) {
            console.error("Gagal memeriksa profil:", error);
            shouldUpdateProfile = true;
        }
    });

    // --- Logika untuk Produk Kustom (Admin) ---
    function handleProductTypeChange() {
        const selectedType = document.querySelector('input[name="product-type"]:checked').value;
        if (selectedType === 'Custom') {
            customNoteWrapper.classList.remove('d-none');
            standardProductInputs.forEach(el => el.style.display = 'none');
        } else {
            customNoteWrapper.classList.add('d-none');
            standardProductInputs.forEach(el => el.style.display = 'block');
        }
    }

    productTypeRadios.forEach(radio => { radio.addEventListener('change', handleProductTypeChange); });

    // --- LOGIKA TOMBOL TAMBAH PRODUK ---
    addProductBtn.addEventListener('click', () => {
        const type = document.querySelector('input[name="product-type"]:checked')?.value;
        const quantity = parseInt(document.getElementById('product-qty').value);

        if (!type || !quantity || quantity < 1) {
            Swal.fire('Data Tidak Lengkap', 'Pilih jenis produk dan jumlah.', 'warning');
            return;
        }

        let newItem;
        if (type === 'Custom') {
            const customNote = document.getElementById('custom-note').value;
            if (!customNote) {
                Swal.fire('Data Tidak Lengkap', 'Harap isi catatan untuk produk kustom.', 'warning');
                return;
            }
            newItem = {
                productId: `custom_${Date.now()}`,
                type: 'Custom',
                size: '-',
                thickness: 0,
                quantity,
                priceAtPurchase: 0,
                subtotal: 0,
                customNote: customNote
            };
        } else {
            const thickness = document.querySelector('input[name="product-thickness"]:checked')?.value;
            const size = document.getElementById('product-size').value;
            if (!thickness || !size) {
                Swal.fire('Data Tidak Lengkap', 'Harap pilih ketebalan dan ukuran.', 'warning');
                return;
            }
            const productId = `${type.toLowerCase().replace(' ', '_')}_${size.replace('x', '')}_${thickness}`;
            const productData = productMasterMap.get(productId);
            if (!productData) {
                Swal.fire('Error', 'Varian produk tidak ditemukan. Pastikan semua pilihan benar.', 'error');
                return;
            }
            const existingItemIndex = cartItems.findIndex(item => item.productId === productId);
            if (existingItemIndex > -1) {
                cartItems[existingItemIndex].quantity += quantity;
                cartItems[existingItemIndex].subtotal = cartItems[existingItemIndex].quantity * cartItems[existingItemIndex].priceAtPurchase;
                renderProductInTable(cartItems[existingItemIndex]);
                return;
            }
            newItem = {
                productId,
                type: productData.type,
                size: productData.size,
                thickness: productData.thickness,
                quantity,
                priceAtPurchase: productData.price,
                subtotal: productData.price * quantity
            };
        }

        cartItems.push(newItem);
        renderProductInTable(newItem);
        productDetailsWrapper.classList.remove('d-none');
    });

    // --- LOGIKA SUBMIT FORM ---
    orderForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!orderForm.checkValidity()) {
            orderForm.classList.add('was-validated');
            validationModal.show();
            return;
        }
        if (cartItems.length === 0) {
            Swal.fire('Error', 'Keranjang pesanan kosong.', 'error');
            return;
        }
        if (!auth.currentUser) {
            Swal.fire('Sesi Habis', 'Silakan login kembali.', 'warning').then(() => window.location.href = 'login.html');
            return;
        }

        fullPageLoader.classList.remove('d-none');
        try {
            const payload = {
                customerInfo: {
                    name: customerNameInput.value,
                    phone: customerPhoneInput.value,
                },
                shippingAddress: {
                    fullAddress: addressStreetInput.value,
                    province: hiddenProvinceInput.value,
                    city: hiddenCityInput.value,
                    district: hiddenDistrictInput.value,
                },
                items: cartItems.map(item => ({
                    productId: item.productId,
                    type: item.type,
                    size: item.size,
                    thickness: item.thickness,
                    quantity: item.quantity,
                    priceAtPurchase: item.priceAtPurchase,
                    subtotal: item.subtotal,
                    ...(item.customNote && { customNote: item.customNote })
                })),
                paymentMethod: document.querySelector('input[name="paymentMethod"]:checked').value,
                updateProfile: shouldUpdateProfile
            };

            const result = await createOrder(payload);
            window.location.href = `konfirmasi.html?order_id=${result.data.orderId}&new=true`;
        } catch (error) {
            console.error("Gagal menyimpan pesanan:", error);
            Swal.fire('Gagal', `Terjadi kesalahan: ${error.message}`, 'error');
        } finally {
            fullPageLoader.classList.add('d-none');
        }
    });

    // --- Inisialisasi Halaman ---
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            const idTokenResult = await user.getIdTokenResult(true);
            currentUserRole = idTokenResult.claims.role;
            if (currentUserRole === 'admin') {
                adminCustomOption.classList.remove('d-none');
            }
        }
    });

    loadProducts();
    initializeAddressSearch();
});