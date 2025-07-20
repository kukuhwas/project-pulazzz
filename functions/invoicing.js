// functions/invoicing.js

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { getFirestore } = require("firebase-admin/firestore");
const path = require('path');
const pdfmake = require('pdfmake');

// Impor template dan logo
const getInvoiceDocDefinition = require('./pdf-template.js');
const logoBase64 = require('./logo.js');

const db = getFirestore();

// Definisikan font yang akan digunakan
const fonts = {
    Roboto: {
        normal: path.join(__dirname, 'fonts/Roboto-Regular.ttf'),
        bold: path.join(__dirname, 'fonts/Roboto-Medium.ttf'),
        italics: path.join(__dirname, 'fonts/Roboto-Italic.ttf'),
        bolditalics: path.join(__dirname, 'fonts/Roboto-MediumItalic.ttf')
    }
};

const generateInvoicePdf = onCall({ region: 'asia-southeast2' }, async (request) => {
    const orderId = request.data.orderId;
    if (!orderId) {
        throw new HttpsError('invalid-argument', 'Fungsi harus dipanggil dengan "orderId".');
    }

    try {
        const orderDoc = await db.collection('orders').doc(orderId).get();
        if (!orderDoc.exists) {
            throw new HttpsError('not-found', 'Order tidak ditemukan.');
        }
        const orderData = orderDoc.data();

        const docDefinition = getInvoiceDocDefinition(orderData, logoBase64);

        const printer = new pdfmake(fonts);
        const pdfDoc = printer.createPdfKitDocument(docDefinition);

        const pdfBuffer = await new Promise((resolve, reject) => {
            const chunks = [];
            pdfDoc.on('data', chunk => chunks.push(chunk));
            pdfDoc.on('end', () => resolve(Buffer.concat(chunks)));
            pdfDoc.on('error', reject);
            pdfDoc.end();
        });

        return {
            pdf: pdfBuffer.toString('base64'),
            fileName: `Invoice-${orderData.displayId || orderId}.pdf`
        };
    } catch (error) {
        console.error("Gagal membuat PDF invoice:", error);
        throw new HttpsError('internal', 'Gagal membuat PDF invoice.', error);
    }
});

module.exports = {
    generateInvoicePdf
};