// public/js/form-pemesanan.js

import { db, auth, functions } from './firebase-config.js';
import { collection, doc, getDoc, query, where, getDocs } from "https://www.gstatic.com/firebasejs/9.19.1/firebase-firestore.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/9.19.1/firebase-functions.js";

document.addEventListener('DOMContentLoaded', () => {

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

    let cartItems = [];

    // --- FUNGSI HELPER BARU UNTUK VALIDASI HP DI FRONTEND ---
    function formatAndValidatePhone(inputElement) {
        let value = inputElement.value.replace(/\D/g, ''); // Hapus non-digit

        // Jika diawali 62, hapus untuk edit
        if (value.startsWith('62')) {
            value = value.substring(2);
        }
        // Jika diawali 0, hapus untuk edit
        if (value.startsWith('0')) {
            value = value.substring(1);
        }

        inputElement.value = value; // Tampilkan nomor tanpa 0 atau 62 di depan
    }

    // --- Event Listener untuk formating nomor HP ---
    customerPhoneInput.addEventListener('input', (event) => {
        // Hanya izinkan angka
        event.target.value = event.target.value.replace(/\D/g, '');
    });

    customerPhoneInput.addEventListener('blur', (event) => {
        // Format saat pengguna selesai mengetik
        formatAndValidatePhone(event.target);
    });


    // --- Logika Dropdown Alamat (TETAP SAMA) ---
    async function populateDropdown(collectionName, selectElement, filterField, filterValue) {
        selectElement.length = 1;
        selectElement.disabled = true;
        try {
            let q = filterField && filterValue ?
                query(collection(db, collectionName), where(filterField, "==", filterValue)) :
                query(collection(db, collectionName));

            const querySnapshot = await getDocs(q);
            querySnapshot.forEach((doc) => {
                selectElement.add(new Option(doc.data().name, doc.id));
            });
            if (!querySnapshot.empty) {
                selectElement.disabled = false;
            }
        } catch (error) {
            console.error(`Gagal memuat data ${collectionName}: `, error);
        }
    }

    populateDropdown('provinces', provinceSelect);
    provinceSelect.addEventListener('change', (e) => {
        citySelect.length = 1; citySelect.disabled = true;
        districtSelect.length = 1; districtSelect.disabled = true;
        if (e.target.value) populateDropdown('cities', citySelect, 'provinceId', e.target.value);
    });
    citySelect.addEventListener('change', (e) => {
        districtSelect.length = 1; districtSelect.disabled = true;
        if (e.target.value) populateDropdown('districts', districtSelect, 'cityId', e.target.value);
    });

    // --- Logika Keranjang Belanja (TETAP SAMA) ---
    function renderProductInTable(item) {
        const rowId = `row-${item.productId}`;
        const existingRow = document.getElementById(rowId);
        if (existingRow) existingRow.remove();

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
                cartItems[existingItemIndex].quantity += quantity;
                cartItems[existingItemIndex].subtotal = cartItems[existingItemIndex].quantity * cartItems[existingItemIndex].priceAtPurchase;
                renderProductInTable(cartItems[existingItemIndex]);
            } else {
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

    // --- LOGIKA SUBMIT FORM (DIPERBARUI) ---
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

        // --- PERBAIKAN: VALIDASI PANJANG NOMOR HP DI FRONTEND ---
        const phoneValue = document.getElementById('customer-phone').value;
        const fullPhone = `62${phoneValue}`;
        if (fullPhone.length < 11 || fullPhone.length > 15) {
            Swal.fire('Error', 'Panjang nomor telepon tidak valid.', 'error');
            return;
        }
        // --- AKHIR PERBAIKAN ---


        fullPageLoader.classList.remove('d-none');

        try {
            // Gabungkan +62 dengan input pengguna
            const customerPhone = `62${document.getElementById('customer-phone').value}`;

            // Siapkan data untuk dikirim ke Cloud Function
            const payload = {
                customerInfo: {
                    name: document.getElementById('customer-name').value,
                    phone: customerPhone,
                },
                shippingAddress: {
                    fullAddress: document.getElementById('address-street').value,
                    province: provinceSelect.options[provinceSelect.selectedIndex].text,
                    city: citySelect.options[citySelect.selectedIndex].text,
                    district: districtSelect.options[districtSelect.selectedIndex].text,
                },
                // PERBAIKAN DI SINI: Sertakan semua data item yang relevan
                items: cartItems.map(item => ({
                    productType: item.productType,
                    size: item.size,
                    quantity: item.quantity,
                    priceAtPurchase: item.priceAtPurchase,
                    subtotal: item.subtotal
                })),
                paymentMethod: document.querySelector('input[name="paymentMethod"]:checked').nextElementSibling.textContent.trim(),
            };

            // Panggil Cloud Function
            const createOrder = httpsCallable(functions, 'createOrderAndProfile');
            const result = await createOrder(payload);

            // Arahkan ke halaman konfirmasi dengan ID pesanan dari hasil function
            window.location.href = `konfirmasi.html?order_id=${result.data.orderId}&new=true`;

        } catch (error) {
            console.error("Gagal menyimpan pesanan:", error);
            Swal.fire('Gagal', `Terjadi kesalahan: ${error.message}`, 'error');
        } finally {
            fullPageLoader.classList.add('d-none');
        }
    });
});