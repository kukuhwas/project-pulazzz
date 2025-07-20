// functions/pdf-template.js

const { Timestamp } = require("firebase-admin/firestore");

function getInvoiceDocDefinition(orderData, logoBase64) {
    const formatCurrency = (number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(number);

    const orderTimestamp = orderData.createdAt || Timestamp.now();
    const orderDate = orderTimestamp.toDate().toLocaleDateString('id-ID', {
        day: 'numeric', month: 'long', year: 'numeric'
    });

    const tableBody = [
        [{ text: 'Deskripsi', style: 'tableHeader' }, { text: 'Jumlah', style: 'tableHeader', alignment: 'right' }, { text: 'Harga Satuan', style: 'tableHeader', alignment: 'right' }, { text: 'Subtotal', style: 'tableHeader', alignment: 'right' }]
    ];

    let grandTotal = 0;
    orderData.items.forEach(item => {
        const price = item.price || 50000;
        const subtotal = item.quantity * price;
        grandTotal += subtotal;
        tableBody.push([
            `${item.productType} (${item.size})`,
            { text: item.quantity, alignment: 'right' },
            { text: formatCurrency(price), alignment: 'right' },
            { text: formatCurrency(subtotal), alignment: 'right' }
        ]);
    });

    tableBody.push([
        { text: 'Total', colSpan: 3, style: 'tableTotal', alignment: 'right' },
        {},
        {},
        { text: formatCurrency(grandTotal), style: 'tableTotal', alignment: 'right' }
    ]);

    const docDefinition = {
        pageSize: 'A5',
        // Menambahkan margin halaman agar header bisa menempel di tepi
        pageMargins: [0, 0, 0, 0], 
        content: [
            // --- HEADER DENGAN BACKGROUND ---
            {
                table: {
                    widths: ['*'],
                    body: [
                        [{
                            // Kolom untuk logo dan detail invoice
                            columns: [
                                { image: logoBase64, width: 120, margin: [20, 15, 0, 15] }, // margin [kiri, atas, kanan, bawah]
                                {
                                    stack: [
                                        { text: 'INVOICE', style: 'invoiceTitle' },
                                        { text: `Nomor: ${orderData.displayId || 'N/A'}`, style: 'invoiceDetails' },
                                        { text: `Tanggal: ${orderDate}`, style: 'invoiceDetails' }
                                    ],
                                    alignment: 'right',
                                    margin: [0, 20, 20, 0]
                                }
                            ],
                        }]
                    ]
                },
                // Warna background header
                layout: {
                    hLineWidth: () => 0,
                    vLineWidth: () => 0,
                    fillColor: '#2C3E50' // Ganti dengan kode warna header Anda
                }
            },
            
            // --- KONTEN UTAMA DENGAN PADDING ---
            {
                // Bagian ini membungkus sisa konten agar memiliki padding
                stack: [
                    {
                        columns: [
                            {
                                stack: [
                                    { text: 'Ditagihkan Kepada:', style: 'header' },
                                    `${orderData.customerInfo.name}`,
                                    `${orderData.customerInfo.phone}`
                                ],
                            },
                            {
                                stack: [
                                    { text: 'Dikirim Kepada:', style: 'header' },
                                    `${orderData.customerInfo.name}`,
                                    `${orderData.shippingAddress.fullAddress}, ${orderData.shippingAddress.district}, ${orderData.shippingAddress.city}`
                                ],
                                alignment: 'right',
                            }
                        ],
                        margin: [0, 20, 0, 0]
                    },
                    {
                        table: {
                            headerRows: 1,
                            widths: ['*', 'auto', 'auto', 'auto'],
                            body: tableBody
                        },
                        layout: 'lightHorizontalLines',
                        margin: [0, 20, 0, 0]
                    },
                    { text: 'Terima kasih atas pesanan Anda. | Pulazzz - PT Lokatara Industri Persada | halo.pulazzz@gmail.com', style: 'footer' }
                ],
                // Memberi padding pada konten utama agar tidak menempel di tepi
                margin: [30, 20, 30, 20] 
            }
        ],
        styles: {
            // Style untuk teks di dalam header berwarna
            invoiceTitle: { fontSize: 24, bold: true, alignment: 'right', color: '#FFFFFF' }, // Warna putih
            invoiceDetails: { fontSize: 9, alignment: 'right', color: '#FFFFFF' }, // Warna putih
            
            // Style untuk sisa dokumen
            invoiceStatus: { fontSize: 11, bold: true, alignment: 'right', color: '#4CAF50', margin: [0, 2, 0, 0] },
            header: { fontSize: 11, bold: true, margin: [0, 0, 0, 4] },
            tableHeader: { bold: true, fontSize: 10, color: 'black' },
            tableTotal: { bold: true, fontSize: 11 },
            footer: { fontSize: 8, italics: true, alignment: 'center', color: '#aaaaaa', margin: [0, 40, 0, 0] }
        }
    };
    return docDefinition;
}

module.exports = getInvoiceDocDefinition;