// public/js/form-pemesanan.js

import { db, auth, functions } from './firebase-config.js';
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/9.19.1/firebase-firestore.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/9.19.1/firebase-functions.js";

document.addEventListener('DOMContentLoaded', () => {

    // --- Referensi Elemen & State ---
    const orderForm = document.getElementById('order-form');
    const customerPhoneInput = document.getElementById('customer-phone');
    const fullPageLoader = document.getElementById('full-page-loader');
    const addressSearchSelect = document.getElementById('address-search');
    const hiddenProvinceInput = document.getElementById('address-province');
    const hiddenCityInput = document.getElementById('address-city');
    const hiddenDistrictInput = document.getElementById('address-district');
    const productDetailsWrapper = document.getElementById('product-details-wrapper');
    const productListTbody = document.getElementById('product-list');
    const productSizeSelect = document.getElementById('product-size');
    const productQtyInput = document.getElementById('product-qty');
    const addProductBtn = document.getElementById('add-product-btn');
    const validationModal = new bootstrap.Modal(document.getElementById('validationModal'));

    let cartItems = [];

    // --- LOGIKA PENCARIAN ALAMAT ---
    function initializeAddressSearch() {
        const searchAddress = httpsCallable(functions, 'searchAddress');
        const tomSelect = new TomSelect(addressSearchSelect, {
            valueField: 'id',
            labelField: 'text',
            searchField: 'text',
            create: false,
            placeholder: 'Ketik min. 3 huruf nama kecamatan/kota...',
            render: {
                item: (data, escape) => `<div>${escape(data.district)}, ${escape(data.city)}, ${escape(data.province)}</div>`,
                option: (data, escape) => `<div><strong class="d-block">${escape(data.district)}</strong><small class="text-muted">${escape(data.city)}, ${escape(data.province)}</small></div>`,
                no_results: (data, escape) => `<div class="p-2">Tidak ditemukan hasil untuk "${escape(data.input)}".</div>`,
                loading: (data, escape) => `<div class="p-2 text-muted">Mencari...</div>`,
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
            } else {
                hiddenProvinceInput.value = '';
                hiddenCityInput.value = '';
                hiddenDistrictInput.value = '';
            }
        });
    }

    initializeAddressSearch();

    // --- FUNGSI HELPER & EVENT LISTENER LAINNYA ---
    function formatPhoneForDisplay(inputElement) {
        let value = inputElement.value.replace(/\D/g, '');
        if (value.startsWith('62')) { value = value.substring(2); }
        if (value.startsWith('0')) { value = value.substring(1); }
        inputElement.value = value;
    }

    customerPhoneInput.addEventListener('input', (event) => {
        event.target.value = event.target.value.replace(/\D/g, '');
    });

    customerPhoneInput.addEventListener('blur', (event) => {
        formatPhoneForDisplay(event.target);
    });

    // --- LOGIKA KERANJANG BELANJA ---
    function renderProductInTable(item) {
        const rowId = `row-${item.productId}`;
        const existingRow = document.getElementById(rowId);
        if (existingRow) existingRow.remove();

        const newRow = document.createElement('tr');
        newRow.id = rowId;
        newRow.innerHTML = `
            <td>${item.type} ${item.size} (${item.thickness} cm)</td>
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
        const thickness = document.querySelector('input[name="product-thickness"]:checked')?.value;
        const size = productSizeSelect.value;
        const quantity = parseInt(productQtyInput.value);

        if (!type || !thickness || !size || !quantity || quantity < 1) {
            Swal.fire('Data Tidak Lengkap', 'Harap pilih Jenis Produk, Ketebalan, Ukuran, dan Jumlah yang valid.', 'warning');
            return;
        }

        productDetailsWrapper.classList.remove('d-none');
        
        const productId = `${type.toLowerCase().replace(' ', '_')}_${size.replace('x', '')}_${thickness}`;

        try {
            const productRef = doc(db, "products", productId);
            const productSnap = await getDoc(productRef);
            if (!productSnap.exists()) {
                Swal.fire('Error', 'Varian produk tidak ditemukan di database. Pastikan semua pilihan benar.', 'error');
                return;
            }

            const productData = productSnap.data();
            const existingItemIndex = cartItems.findIndex(item => item.productId === productId);

            if (existingItemIndex > -1) {
                cartItems[existingItemIndex].quantity += quantity;
                cartItems[existingItemIndex].subtotal = cartItems[existingItemIndex].quantity * cartItems[existingItemIndex].priceAtPurchase;
                renderProductInTable(cartItems[existingItemIndex]);
            } else {
                const newCartItem = {
                    productId,
                    type: productData.type,
                    size: productData.size,
                    thickness: productData.thickness,
                    quantity,
                    priceAtPurchase: productData.price,
                    subtotal: productData.price * quantity
                };
                cartItems.push(newCartItem);
                renderProductInTable(newCartItem);
            }
        } catch (error) {
            console.error("Error saat menambahkan produk: ", error);
            Swal.fire('Error', 'Gagal menambahkan produk. Cek konsol untuk detail.', 'error');
        }
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
            Swal.fire('Error', 'Keranjang pesanan kosong. Harap tambahkan produk.', 'error');
            return;
        }

        if (!auth.currentUser) {
            Swal.fire('Sesi Habis', 'Silakan login kembali untuk melanjutkan.', 'warning')
                .then(() => window.location.href = 'login.html');
            return;
        }

        const phoneValue = document.getElementById('customer-phone').value;
        if ((`62${phoneValue}`).length < 11 || (`62${phoneValue}`).length > 15) {
            Swal.fire('Error', 'Panjang nomor telepon tidak valid.', 'error');
            return;
        }

        fullPageLoader.classList.remove('d-none');

        try {
            const payload = {
                customerInfo: {
                    name: document.getElementById('customer-name').value,
                    phone: phoneValue,
                },
                shippingAddress: {
                    fullAddress: document.getElementById('address-street').value,
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
                    subtotal: item.subtotal
                })),
                paymentMethod: document.querySelector('input[name="paymentMethod"]:checked').value,
            };

            const createOrder = httpsCallable(functions, 'createOrderAndProfile');
            const result = await createOrder(payload);

            window.location.href = `konfirmasi.html?order_id=${result.data.orderId}&new=true`;

        } catch (error) {
            console.error("Gagal menyimpan pesanan:", error);
            Swal.fire('Gagal', `Terjadi kesalahan: ${error.message}`, 'error');
        } finally {
            fullPageLoader.classList.add('d-none');
        }
    });
});