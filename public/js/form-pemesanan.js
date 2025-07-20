// public/js/form-pemesanan.js

import { db, auth, functions } from './firebase-config.js';
import { collection, doc, getDoc, query, where, getDocs } from "https://www.gstatic.com/firebasejs/9.19.1/firebase-firestore.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/9.19.1/firebase-functions.js";

document.addEventListener('DOMContentLoaded', () => {

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

    async function initializeAddressSearch() {
        const tomSelect = new TomSelect(addressSearchSelect, {
            valueField: 'id',
            labelField: 'text',
            searchField: 'text',
            create: false,
            placeholder: 'Ketik untuk mencari kecamatan...',
            render: {
                item: function (data, escape) {
                    return `<div>${escape(data.district)}, ${escape(data.city)}, ${escape(data.province)}</div>`;
                },
                option: function (data, escape) {
                    return `<div><strong class="d-block">${escape(data.district)}</strong><small class="text-muted">${escape(data.city)}, ${escape(data.province)}</small></div>`;
                },
            },
            load: async (query, callback) => {
                if (tomSelect.loading > 1) {
                    return callback();
                }

                try {
                    console.log("Memuat data alamat dari Firestore...");
                    const [provincesSnap, citiesSnap, districtsSnap] = await Promise.all([
                        getDocs(collection(db, "provinces")),
                        getDocs(collection(db, "cities")),
                        getDocs(collection(db, "districts"))
                    ]);

                    const provinces = new Map(provincesSnap.docs.map(doc => [doc.id, doc.data().name]));
                    const cities = new Map(citiesSnap.docs.map(doc => [doc.id, { name: doc.data().name, provinceId: doc.data().provinceId }]));

                    const addressOptions = districtsSnap.docs.map(doc => {
                        const district = doc.data();
                        const city = cities.get(district.cityId);
                        const province = provinces.get(city?.provinceId);
                        const text = `${district.name}, ${city?.name || ''}, ${province || ''}`;
                        return { id: doc.id, district: district.name, city: city?.name || '', province: province || '', text };
                    });

                    tomSelect.addOptions(addressOptions);
                    callback(addressOptions);
                    console.log("Data alamat berhasil dimuat.");

                } catch (error) {
                    console.error("Gagal memuat data alamat untuk pencarian:", error);
                    callback([]);
                }
            }
        });

        tomSelect.on('change', (value) => {
            const selectedData = tomSelect.options[value];
            if (selectedData) {
                hiddenProvinceInput.value = selectedData.province;
                hiddenCityInput.value = selectedData.city;
                hiddenDistrictInput.value = selectedData.district;
                addressSearchSelect.setCustomValidity("");
            } else {
                hiddenProvinceInput.value = '';
                hiddenCityInput.value = '';
                hiddenDistrictInput.value = '';
            }
        });
    }

    initializeAddressSearch();

    function formatAndValidatePhone(inputElement) {
        let value = inputElement.value.replace(/\D/g, '');
        if (value.startsWith('62')) { value = value.substring(2); }
        if (value.startsWith('0')) { value = value.substring(1); }
        inputElement.value = value;
    }

    customerPhoneInput.addEventListener('input', (event) => {
        event.target.value = event.target.value.replace(/\D/g, '');
    });

    customerPhoneInput.addEventListener('blur', (event) => {
        formatAndValidatePhone(event.target);
    });

    // --- LOGIKA KERANJANG BELANJA (YANG HILANG SEBELUMNYA) ---
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
            Swal.fire('Data Tidak Lengkap', 'Harap pilih Jenis Produk, Ukuran, dan Jumlah yang valid.', 'warning');
            return;
        }

        productDetailsWrapper.classList.remove('d-none');
        const productId = `${type.toLowerCase().replace(' ', '_')}_${size.replace('x', '')}`;

        try {
            const productRef = doc(db, "products", productId);
            const productSnap = await getDoc(productRef);
            if (!productSnap.exists()) {
                Swal.fire('Error', 'Produk tidak ditemukan di database.', 'error');
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
            Swal.fire('Error', 'Gagal menambahkan produk. Cek konsol untuk detail.', 'error');
        }
    });

    // --- LOGIKA SUBMIT FORM ---
    orderForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        event.stopPropagation();

        if (!orderForm.checkValidity() || !addressSearchSelect.value) {
            orderForm.classList.add('was-validated');
            if (!addressSearchSelect.value) {
                document.querySelector('.ts-control').classList.add('is-invalid');
            }
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
        const fullPhone = `62${phoneValue}`;
        if (fullPhone.length < 11 || fullPhone.length > 15) {
            Swal.fire('Error', 'Panjang nomor telepon tidak valid. Pastikan antara 9-13 digit setelah +62.', 'error');
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
                    productType: item.productType,
                    size: item.size,
                    quantity: item.quantity,
                    priceAtPurchase: item.priceAtPurchase,
                    subtotal: item.subtotal
                })),
                paymentMethod: document.querySelector('input[name="paymentMethod"]:checked').nextElementSibling.textContent.trim(),
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