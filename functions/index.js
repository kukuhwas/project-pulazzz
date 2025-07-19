const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onCall } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

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
    transaction.update(orderRef, { displayId: displayId });
    
    console.log(`Generated displayId: ${displayId} for order: ${event.params.orderId}`);
    return displayId;
  });
});


// --- FUNGSI 2: MENGIRIM EMAIL KONFIRMASI ---
exports.sendOrderEmail = onCall({ region: 'asia-southeast2', secrets: ["SENDGRID_API_KEY"] }, async (request) => {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
  const orderId = request.data.orderId;
  if (!orderId) {
    throw new functions.https.HttpsError('invalid-argument', 'Fungsi harus dipanggil dengan "orderId".');
  }
  try {
    const orderDoc = await db.collection('orders').doc(orderId).get();
    if (!orderDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Order tidak ditemukan.');
    }
    const orderData = orderDoc.data();
    let emailTemplate = fs.readFileSync(path.join(__dirname, 'templates/order-notification.html'), 'utf8');
    emailTemplate = emailTemplate.replace('{{displayId}}', orderData.displayId);
    emailTemplate = emailTemplate.replace('{{customerName}}', orderData.customerInfo.name);
    emailTemplate = emailTemplate.replace('{{customerPhone}}', orderData.customerInfo.phone);
    const fullAddress = `${orderData.shippingAddress.fullAddress}, ${orderData.shippingAddress.district}, ${orderData.shippingAddress.city}`;
    emailTemplate = emailTemplate.replace('{{shippingAddress}}', fullAddress);
    let itemListHtml = '';
    orderData.items.forEach(item => {
      itemListHtml += `<li><strong>${item.quantity}x</strong> - ${item.productType} (${item.size})</li>`;
    });
    emailTemplate = emailTemplate.replace('{{itemList}}', itemListHtml);
    
    const msg = {
      to: config.email.to,
      from: config.email.from,
      subject: `Pesanan Baru Masuk - ${orderData.displayId}`,
      html: emailTemplate,
    };
    await sgMail.send(msg);
    return { success: true, message: `Notifikasi produksi berhasil dikirim untuk order ${orderData.displayId}` };
  } catch (error) {
    console.error("Gagal mengirim email:", error);
    throw new functions.https.HttpsError('internal', 'Gagal mengirim email.', error);
  }
});


// --- FUNGSI 3: MENGATUR PERAN PENGGUNA ---
exports.setUserRole = onCall({ region: 'asia-southeast2' }, async (request) => {
  if (request.auth.token.role !== 'admin') {
    throw new functions.https.HttpsError('permission-denied', 'Hanya admin yang bisa mengubah peran pengguna.');
  }
  const { email, role } = request.data;
  const validRoles = ['sales', 'produksi', 'admin'];
  if (!email || !role || !validRoles.includes(role)) {
    throw new functions.https.HttpsError('invalid-argument', 'Email atau peran tidak valid.');
  }
  try {
    const user = await admin.auth().getUserByEmail(email);
    await admin.auth().setCustomUserClaims(user.uid, { role: role });
    return { success: true, message: `Berhasil menjadikan ${email} sebagai ${role}.` };
  } catch (error) {
    console.error("Gagal mengatur peran:", error);
    throw new functions.https.HttpsError('internal', 'Gagal mengatur peran pengguna.', error);
  }
});


// --- FUNGSI 4: MENGAMBIL DAFTAR SEMUA PENGGUNA ---
exports.listAllUsers = onCall({ region: 'asia-southeast2' }, async (request) => {
  if (request.auth.token.role !== 'admin') {
    throw new functions.https.HttpsError('permission-denied', 'Hanya admin yang bisa melihat daftar pengguna.');
  }
  try {
    const userRecords = await admin.auth().listUsers();
    return userRecords.users.map(user => ({
      uid: user.uid,
      email: user.email,
      role: user.customClaims?.role || 'N/A',
    }));
  } catch (error) {
    console.error("Gagal mengambil daftar pengguna:", error);
    throw new functions.https.HttpsError('internal', 'Gagal mengambil daftar pengguna.');
  }
});


// --- FUNGSI 5: MEMBUAT PENGGUNA BARU ---
exports.createNewUser = onCall({ region: 'asia-southeast2' }, async (request) => {
  if (request.auth.token.role !== 'admin') {
    throw new functions.https.HttpsError('permission-denied', 'Hanya admin yang bisa membuat pengguna baru.');
  }
  const { email, password, role } = request.data;
  const validRoles = ['sales', 'produksi', 'admin'];
  if (!email || !password || !role || !validRoles.includes(role)) {
    throw new functions.https.HttpsError('invalid-argument', 'Input tidak valid.');
  }
  try {
    const userRecord = await admin.auth().createUser({ email, password });
    await admin.auth().setCustomUserClaims(userRecord.uid, { role: role });
    return { success: true, message: `Berhasil membuat pengguna ${email} dengan peran ${role}.` };
  } catch (error) {
    console.error("Gagal membuat pengguna baru:", error);
    if (error.code === 'auth/email-already-exists') {
        throw new functions.https.HttpsError('already-exists', 'Email sudah terdaftar.');
    }
    throw new functions.https.HttpsError('internal', 'Gagal membuat pengguna baru.');
  }
});