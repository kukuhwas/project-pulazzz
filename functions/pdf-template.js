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
        content: [
            {
                columns: [
                    { image: logoBase64, width: 150 },
                    {
                        stack: [
                            { text: 'INVOICE', style: 'invoiceTitle' },
                            { text: `Nomor: ${orderData.displayId || 'N/A'}`, style: 'invoiceDetails' },
                            { text: `Tanggal: ${orderDate}`, style: 'invoiceDetails' },
                            { text: 'LUNAS', style: 'invoiceStatus' }
                        ],
                        alignment: 'right'
                    }
                ]
            },
            { canvas: [{ type: 'line', x1: 0, y1: 15, x2: 515, y2: 15, lineWidth: 1, lineColor: '#cccccc' }] },
            {
                columns: [
                    {
                        stack: [
                            { text: 'Ditagihkan Kepada:', style: 'header' },
                            `${orderData.customerInfo.name}`,
                            `${orderData.customerInfo.phone}`
                        ],
                        margin: [0, 20, 0, 0]
                    },
                    {
                        stack: [
                            { text: 'Dikirim Kepada:', style: 'header' },
                            `${orderData.customerInfo.name}`,
                            `${orderData.shippingAddress.fullAddress}, ${orderData.shippingAddress.district}, ${orderData.shippingAddress.city}`
                        ],
                        alignment: 'right',
                        margin: [0, 20, 0, 0]
                    }
                ]
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
        styles: {
            invoiceTitle: { fontSize: 28, bold: true, alignment: 'right', color: '#333333' },
            invoiceDetails: { fontSize: 10, alignment: 'right', color: '#555555' },
            invoiceStatus: { fontSize: 12, bold: true, alignment: 'right', color: '#4CAF50', margin: [0, 2, 0, 0] },
            header: { fontSize: 12, bold: true, margin: [0, 0, 0, 4] },
            tableHeader: { bold: true, fontSize: 11, color: 'black' },
            tableTotal: { bold: true, fontSize: 12 },
            footer: { fontSize: 9, italics: true, alignment: 'center', color: '#aaaaaa', margin: [0, 40, 0, 0] }
        }
    };
    return docDefinition;
}

module.exports = getInvoiceDocDefinition;