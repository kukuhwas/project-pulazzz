/**
 * Ringkasan Perubahan:
 * 1. MENGGANTI PUPPETEER: Fungsi `generateInvoicePdf` kini menggunakan 'pdfmake' dan 'html-to-pdfmake' yang jauh lebih ringan dan cepat.
 * 2. EFISIENSI: Menghapus opsi 'memory' dan 'timeoutSeconds' dari fungsi PDF karena tidak lagi diperlukan, sehingga menghemat biaya dan sumber daya.
 * 3. KONFIGURASI FONT: Menambahkan konfigurasi font untuk 'pdfmake'. Anda perlu menyediakan file font (misalnya Roboto) di dalam folder proyek Anda agar PDF dapat dibuat dengan benar.
 * 4. PEMBERSIHAN KODE: Menghapus fungsi `generateInvoiceHtml` yang sudah tidak relevan dan menghapus `require('puppeteer')`.
 */

const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

// Library baru untuk membuat PDF
const pdfmake = require('pdfmake');
const htmlToPdfmake = require('html-to-pdfmake');

// Inisialisasi Firebase Admin SDK
admin.initializeApp();
const db = admin.firestore();

// SendGrid
const sgMail = require('@sendgrid/mail');
// Impor konfigurasi
const config = require('./config.js');
// Modul untuk membaca file dan path
const fs = require('fs');
const path = require('path');

// --- FUNGSI 1: MEMBUAT DISPLAY ID ---
exports.generateDisplayId = onDocumentCreated({ region: 'asia-southeast2', document: "orders/{orderId}" }, async (event) => {
  const orderRef = event.data.ref;
  const now = new Date();
  const timeZone = 'Asia/Jakarta'; // GMT+7
  const options = { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' };
  const formatter = new Intl.DateTimeFormat('sv-SE', options);
  const counterId = formatter.format(now);
  
  const [yyyy, mm, dd] = counterId.split('-');
  const displayDate = `${yyyy.slice(-2)}${mm}${dd}`;

  const counterRef = db.collection('orderCounters').doc(counterId);

  return db.runTransaction(async (transaction) => {
    const counterDoc = await transaction.get(counterRef);
    let newCount = 1;
    if (counterDoc.exists) {
      newCount = counterDoc.data().count + 1;
    }
    
    const formattedCount = String(newCount).padStart(3, '0');
    const displayId = `PO-${displayDate}-${formattedCount}`;

    transaction.set(counterRef, { count: newCount });
    transaction.update(orderRef, {
      displayId: displayId,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    console.log(`Generated displayId: ${displayId} for order: ${event.params.orderId}`);
    return displayId;
  });
});

/**
 * Helper function to replace placeholders in a template string.
 */
function populateTemplate(template, data) {
  let output = template;
  for (const key in data) {
    output = output.replace(new RegExp(`{{${key}}}`, 'g'), data[key]);
  }
  return output;
}

// --- FUNGSI 2: MENGIRIM EMAIL KONFIRMASI ---
exports.sendOrderEmail = onCall({ region: 'asia-southeast2', secrets: ["SENDGRID_API_KEY"] }, async (request) => {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
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
    const emailTemplate = fs.readFileSync(path.join(__dirname, 'templates/order-notification.html'), 'utf8');

    let itemListHtml = '';
    orderData.items.forEach(item => {
      itemListHtml += `<li><strong>${item.quantity}x</strong> - ${item.productType} (${item.size})</li>`;
    });

    const templateData = {
      displayId: orderData.displayId,
      customerName: orderData.customerInfo.name,
      customerPhone: orderData.customerInfo.phone,
      shippingAddress: `${orderData.shippingAddress.fullAddress}, ${orderData.shippingAddress.district}, ${orderData.shippingAddress.city}`,
      itemList: itemListHtml
    };

    const msg = {
      to: config.email.to,
      from: config.email.from,
      subject: `Pesanan Baru Masuk - ${orderData.displayId}`,
      html: populateTemplate(emailTemplate, templateData),
    };
    await sgMail.send(msg);
    return { success: true, message: `Notifikasi produksi berhasil dikirim untuk order ${orderData.displayId}` };
  } catch (error) {
    console.error("Gagal mengirim email:", error);
    throw new HttpsError('internal', 'Gagal mengirim email.', error);
  }
});

/**
 * Helper function to generate invoice HTML from order data.
 */
function getInvoiceHtml(orderData) {
  const invoiceTemplate = fs.readFileSync(path.join(__dirname, 'templates/invoice-template.html'), 'utf8');
  let itemListHtml = '';
  let grandTotal = 0;
  orderData.items.forEach(item => {
    const price = item.price || 50000; // <-- GANTI DENGAN HARGA ASLI DARI item.price
    const subtotal = item.quantity * price;
    grandTotal += subtotal;
    
    const formattedPrice = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(price);
    const formattedSubtotal = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(subtotal);

    itemListHtml += `
      <tr class="item">
        <td>${item.productType} (${item.size})</td>
        <td class="text-right">${item.quantity}</td>
        <td class="text-right">${formattedPrice}</td>
        <td class="text-right">${formattedSubtotal}</td>
      </tr>
    `;
  });
  
  const formattedGrandTotal = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(grandTotal);
  const orderTimestamp = orderData.createdAt || admin.firestore.Timestamp.now();
  const orderDate = orderTimestamp.toDate().toLocaleDateString('id-ID', {
    day: 'numeric', month: 'long', year: 'numeric'
  });

  const templateData = {
    displayId: orderData.displayId || 'N/A',
    orderDate: orderDate,
    customerName: orderData.customerInfo.name,
    customerPhone: orderData.customerInfo.phone,
    shippingAddress: `${orderData.shippingAddress.fullAddress}, ${orderData.shippingAddress.district}, ${orderData.shippingAddress.city}`,
    itemList: itemListHtml,
    grandTotal: formattedGrandTotal
  };

  return populateTemplate(invoiceTemplate, templateData);
}

// --- FUNGSI BARU (DIPERBAIKI): MEMBUAT PDF INVOICE DENGAN PDFMAKE ---
// PENTING: Buat folder 'fonts' di dalam folder 'functions', lalu letakkan file font Roboto (Roboto-Regular.ttf, dll.) di dalamnya.
const fonts = {
  Roboto: {
    normal: path.join(__dirname, 'fonts/Roboto-Regular.ttf'),
    bold: path.join(__dirname, 'fonts/Roboto-Medium.ttf'),
    italics: path.join(__dirname, 'fonts/Roboto-Italic.ttf'),
    bolditalics: path.join(__dirname, 'fonts/Roboto-MediumItalic.ttf')
  }
};

exports.generateInvoicePdf = onCall({ region: 'asia-southeast2' }, async (request) => {
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
    const htmlContent = getInvoiceHtml(orderData);

    const docContent = htmlToPdfmake(htmlContent);
    const printer = new pdfmake(fonts);

    const docDefinition = {
      content: docContent,
      defaultStyle: { font: 'Roboto' }
    };

    const pdfDoc = printer.createPdfKitDocument(docDefinition);

    // Bungkus proses pembuatan buffer PDF dalam sebuah Promise
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

// --- FUNGSI 3: MENGATUR PERAN PENGGUNA ---
exports.setUserRole = onCall({ region: 'asia-southeast2' }, async (request) => {
  if (request.auth.token.role !== 'admin') {
    throw new HttpsError('permission-denied', 'Hanya admin yang bisa mengubah peran pengguna.');
  }
  const { email, role, representativeId } = request.data;
  const validRoles = ['sales', 'produksi', 'admin', 'representatif'];
  if (!email || !role || !validRoles.includes(role)) {
    throw new HttpsError('invalid-argument', 'Email atau peran tidak valid.');
  }
  try {
    const user = await admin.auth().getUserByEmail(email);
    const claims = { role: role };
    claims.representativeId = (role === 'sales' && representativeId) ? representativeId : null;

    await admin.auth().setCustomUserClaims(user.uid, claims);
    return { success: true, message: `Berhasil menjadikan ${email} sebagai ${role}.` };
  } catch (error) {
    console.error("Gagal mengatur peran:", error);
    throw new HttpsError('internal', 'Gagal mengatur peran pengguna.', error);
  }
});

// --- FUNGSI 4: MENGAMBIL DAFTAR SEMUA PENGGUNA ---
exports.listAllUsers = onCall({ region: 'asia-southeast2' }, async (request) => {
  if (request.auth.token.role !== 'admin') {
    throw new HttpsError('permission-denied', 'Hanya admin yang bisa melihat daftar pengguna.');
  }
  try {
    const userRecords = await admin.auth().listUsers();
    return userRecords.users.map(user => ({
      uid: user.uid,
      email: user.email,
      role: user.customClaims?.role || 'N/A',
      representativeId: user.customClaims?.representativeId || null,
    }));
  } catch (error) {
    console.error("Gagal mengambil daftar pengguna:", error);
    throw new HttpsError('internal', 'Gagal mengambil daftar pengguna.');
  }
});

// --- FUNGSI 5: MEMBUAT PENGGUNA BARU ---
exports.createNewUser = onCall({ region: 'asia-southeast2' }, async (request) => {
  if (request.auth.token.role !== 'admin') {
    throw new HttpsError('permission-denied', 'Hanya admin yang bisa membuat pengguna baru.');
  }
  const { email, password, role, representativeId } = request.data;
  const validRoles = ['sales', 'produksi', 'admin', 'representatif'];
  if (!email || !password || !role || !validRoles.includes(role)) {
    throw new HttpsError('invalid-argument', 'Input tidak valid.');
  }
  try {
    const userRecord = await admin.auth().createUser({ email, password });
    const claims = { role: role };
    claims.representativeId = (role === 'sales' && representativeId) ? representativeId : null;

    await admin.auth().setCustomUserClaims(userRecord.uid, claims);
    return { success: true, message: `Berhasil membuat pengguna ${email} dengan peran ${role}.` };
  } catch (error) {
    console.error("Gagal membuat pengguna baru:", error);
    if (error.code === 'auth/email-already-exists') {
        throw new HttpsError('already-exists', 'Email sudah terdaftar.');
    }
    if (error.code === 'auth/invalid-password') {
        throw new HttpsError('invalid-argument', 'Password tidak valid. Harus terdiri dari minimal 6 karakter.');
    }
    throw new HttpsError('internal', 'Gagal membuat pengguna baru.');
  }
});

// --- FUNGSI 6: MENGIRIM LINK RESET PASSWORD ---
exports.sendPasswordReset = onCall({
  region: 'asia-southeast2',
  secrets: ["SENDGRID_API_KEY"],
  cors: [/localhost:\d+$/, "https://pulazzz.lokataraindustry.com"]
}, async (request) => {
  if (request.auth.token.role !== 'admin') {
    throw new HttpsError('permission-denied', 'Hanya admin yang bisa mengirim reset password.');
  }
  const { email } = request.data;
  if (!email) {
    throw new HttpsError('invalid-argument', 'Email wajib diisi.');
  }
  try {
    const link = await admin.auth().generatePasswordResetLink(email);
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    await sgMail.send({
      to: email,
      from: config.email.from,
      subject: 'Reset Password Akun Sistem Order Pulazzz Anda',
      html: `Halo,<br><br>Anda menerima email ini karena admin telah meminta reset password untuk akun Anda. Silakan klik link di bawah ini untuk membuat password baru:<br><br><a href="${link}">Reset Password</a><br><br>Jika Anda tidak merasa meminta ini, silakan abaikan email ini.<br><br>Terima kasih,<br>Tim Pulazzz`
    });
    return { success: true, message: `Link reset password berhasil dikirim ke ${email}.` };
  } catch (error) {
    console.error("Gagal mengirim link reset password:", error);
    if (error.code === 'auth/user-not-found') {
      throw new HttpsError('not-found', 'Pengguna dengan email tersebut tidak ditemukan.');
    }
    throw new HttpsError('internal', 'Gagal mengirim link reset password.');
  }
});
