// functions/invoicing.js

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { getFirestore } = require("firebase-admin/firestore");
const { getStorage } = require("firebase-admin/storage"); // <-- Impor baru untuk Storage
const path = require('path');
const pdfmake = require('pdfmake');

const getInvoiceDocDefinition = require('./pdf-template.js');
const logoBase64 = require('./logo.js');

const db = getFirestore();
const bucket = getStorage().bucket(); // <-- Inisialisasi Storage Bucket

const fonts = {
    Roboto: {
        normal: path.join(__dirname, 'fonts/Roboto-Regular.ttf'),
        bold: path.join(__dirname, 'fonts/Roboto-Medium.ttf'),
        italics: path.join(__dirname, 'fonts/Roboto-Italic.ttf'),
        bolditalics: path.join(__dirname, 'fonts/Roboto-MediumItalic.ttf')
    }
};

const generateInvoicePdf = onCall(async (request) => {
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
        const fileName = `Invoice-${orderData.displayId || orderId}.pdf`;
        const filePath = `invoices/${fileName}`;

        // 1. Buat PDF di memori (tetap sama)
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

        // 2. Unggah PDF ke Cloud Storage
        const file = bucket.file(filePath);
        await file.save(pdfBuffer, {
            metadata: {
                contentType: 'application/pdf',
            },
        });

        // 3. Buat Signed URL yang berlaku selama 15 menit
        const [signedUrl] = await file.getSignedUrl({
            action: 'read',
            expires: Date.now() + 15 * 60 * 1000, // 15 menit dari sekarang
        });

        // 4. Kembalikan URL ke frontend
        return { url: signedUrl };

    } catch (error) {
        console.error("Gagal membuat PDF invoice:", error);
        throw new HttpsError('internal', 'Gagal memproses PDF invoice.');
    }
});

module.exports = {
    generateInvoicePdf
};