// functions/index.js

const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { getFirestore, FieldValue, Timestamp } = require("firebase-admin/firestore");

// Library lain
const pdfmake = require('pdfmake');
const htmlToPdfmake = require('html-to-pdfmake');
const { JSDOM } = require('jsdom');
const sgMail = require('@sendgrid/mail');
const config = require('./config.js');
const fs = require('fs');
const path = require('path');
const logoBase64 = require('./logo.js');
const getInvoiceDocDefinition = require('./pdf-template.js'); // Impor template PDF

// Inisialisasi Firebase
admin.initializeApp();
const db = getFirestore();

// --- FUNGSI 1: MEMBUAT DISPLAY ID ---
exports.generateDisplayId = onDocumentCreated({ region: 'asia-southeast2', document: "orders/{orderId}" }, async (event) => {
  const orderRef = event.data.ref;
  const now = new Date();
  const timeZone = 'Asia/Jakarta';
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
      createdAt: FieldValue.serverTimestamp() 
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


// --- FUNGSI PDF INVOICE ---
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
      
      // Menggunakan fungsi yang diimpor dari file terpisah
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

// --- FUNGSI MANAJEMEN PENGGUNA ---
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