// functions/index.js

const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const path = require('path');
const logoBase64 = require('./logo.js');
const getInvoiceDocDefinition = require('./pdf-template.js');
const pdfmake = require('pdfmake');

// Inisialisasi Firebase
admin.initializeApp();
const db = getFirestore();

// --- FUNGSI HELPER BARU ---
/**
 * Memformat nomor telepon Indonesia ke format standar 62.
 * @param {string} phoneNumber Nomor telepon mentah.
 * @returns {string|null} Nomor telepon yang diformat atau null jika tidak valid.
 */
function formatIndonesianPhoneNumber(phoneNumber) {
  if (!phoneNumber || typeof phoneNumber !== 'string') return null;

  let cleaned = phoneNumber.replace(/\D/g, '');

  if (cleaned.startsWith('62')) {
    // Sudah benar
  } else if (cleaned.startsWith('0')) {
    cleaned = '62' + cleaned.substring(1);
  } else if (cleaned.startsWith('8')) {
    cleaned = '62' + cleaned;
  } else {
    return null;
  }

  // Validasi panjang (11 s/d 15 digit totalnya)
  if (cleaned.length >= 11 && cleaned.length <= 15) {
    return cleaned;
  }

  return null;
}

// --- CLOUD FUNCTION BARU UNTUK MEMBUAT PESANAN ---
exports.createOrderAndProfile = onCall({ region: 'asia-southeast2' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Anda harus login untuk membuat pesanan.');
  }

  const { customerInfo, shippingAddress, items, paymentMethod } = request.data;
  const creator = { uid: request.auth.uid, email: request.auth.token.email };

  const formattedPhone = formatIndonesianPhoneNumber(customerInfo.phone);
  if (!formattedPhone) {
    throw new HttpsError('invalid-argument', 'Nomor telepon tidak valid.');
  }

  const totalAmount = items.reduce((total, item) => total + (item.priceAtPurchase * item.quantity), 0);

  const claims = request.auth.token;
  let representativeIdForOrder = null;
  if (claims.role === 'representatif') {
    representativeIdForOrder = creator.uid;
  } else if (claims.role === 'sales' && claims.representativeId) {
    representativeIdForOrder = claims.representativeId;
  }

  try {
    let orderIdToReturn = null;

    await db.runTransaction(async (transaction) => {
      const phoneRef = db.collection('phoneNumbers').doc(formattedPhone);
      const profilesQuery = db.collection('profiles').where('phone', '==', formattedPhone).limit(1);

      const existingProfiles = await transaction.get(profilesQuery);
      let profileId;

      if (existingProfiles.empty) {
        const phoneDoc = await transaction.get(phoneRef);
        if (phoneDoc.exists) {
          throw new HttpsError('already-exists', 'Nomor telepon sudah terdaftar dengan profil lain.');
        }

        const newProfileRef = db.collection('profiles').doc();
        profileId = newProfileRef.id;

        const newProfileData = {
          name: customerInfo.name,
          phone: formattedPhone,
          address: shippingAddress.fullAddress,
          representativeId: representativeIdForOrder,
          createdAt: FieldValue.serverTimestamp()
        };

        transaction.set(newProfileRef, newProfileData);
        transaction.set(phoneRef, { profileId: profileId });

      } else {
        const profileDoc = existingProfiles.docs[0];
        profileId = profileDoc.id;
        const existingProfileRef = profileDoc.ref;

        const profileDataToUpdate = {};
        if (profileDoc.data().name !== customerInfo.name) {
          profileDataToUpdate.name = customerInfo.name;
        }
        if (profileDoc.data().address !== shippingAddress.fullAddress) {
          profileDataToUpdate.address = shippingAddress.fullAddress;
        }

        if (Object.keys(profileDataToUpdate).length > 0) {
          transaction.update(existingProfileRef, profileDataToUpdate);
        }
      }

      const newOrderRef = db.collection('orders').doc();
      orderIdToReturn = newOrderRef.id;

      const orderData = {
        creator,
        profileId,
        customerInfo: { ...customerInfo, phone: formattedPhone },
        shippingAddress,
        items,
        paymentMethod,
        totalAmount,
        status: 'new_order',
        representativeId: representativeIdForOrder,
        createdAt: FieldValue.serverTimestamp() // <-- PERBAIKAN DITAMBAHKAN DI SINI
      };
      transaction.set(newOrderRef, orderData);
    });

    return { success: true, orderId: orderIdToReturn };

  } catch (error) {
    console.error("Gagal membuat pesanan:", error);
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError('internal', 'Terjadi kesalahan internal saat membuat pesanan.');
  }
});

// --- FUNGSI LAINNYA ---

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
  region: 'asia-southeast2'
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
    // Logika pengiriman email (misalnya via SendGrid) akan ada di sini
    console.log(`Link reset password untuk ${email} adalah: ${link}`);
    return { success: true, message: `Link reset password berhasil dikirim ke ${email}.` };
  } catch (error) {
    console.error("Gagal mengirim link reset password:", error);
    if (error.code === 'auth/user-not-found') {
      throw new HttpsError('not-found', 'Pengguna dengan email tersebut tidak ditemukan.');
    }
    throw new HttpsError('internal', 'Gagal mengirim link reset password.');
  }
});

// --- FUNGSI SIGNUP & UNDANGAN ---

exports.sendInvitation = onCall({ region: 'asia-southeast2', secrets: ["SENDGRID_API_KEY"] }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Anda harus login untuk mengirim undangan.');
  }

  const { inviteeEmail } = request.data;
  if (!inviteeEmail) {
    throw new HttpsError('invalid-argument', 'Email calon pengguna wajib diisi.');
  }

  const inviter = {
    uid: request.auth.uid,
    email: request.auth.token.email
  };

  try {
    // Buat dokumen undangan baru untuk mendapatkan ID unik sebagai kode referal
    const invitationRef = await db.collection('invitations').add({
      inviterUid: inviter.uid,
      inviterEmail: inviter.email,
      inviteeEmail: inviteeEmail,
      status: 'pending',
      createdAt: FieldValue.serverTimestamp()
    });

    const referralCode = invitationRef.id;
    // Ganti URL ini dengan URL aplikasi Anda saat di-deploy
    const signupLink = `http://127.0.0.1:5002/signup.html?ref=${referralCode}`;

    // Kirim email menggunakan SendGrid
    const sgMail = require('@sendgrid/mail');
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    const msg = {
      to: inviteeEmail,
      from: 'noreply@lokataraindustry.com', // Ganti dengan email pengirim Anda
      subject: `Anda Diundang untuk Bergabung dengan Sistem Order Pulazzz`,
      html: `
                <h2>Halo!</h2>
                <p>Anda telah diundang oleh <strong>${inviter.email}</strong> untuk bergabung dengan Sistem Order Pulazzz sebagai Sales.</p>
                <p>Silakan klik link di bawah ini untuk menyelesaikan pendaftaran Anda:</p>
                <a href="${signupLink}" style="background-color: #0d6efd; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Selesaikan Pendaftaran</a>
                <p>Jika Anda tidak merasa diundang, silakan abaikan email ini.</p>
                <br>
                <p>Terima kasih,</p>
                <p>Tim Pulazzz</p>
            `,
    };

    await sgMail.send(msg);
    return { success: true, message: `Undangan berhasil dikirim ke ${inviteeEmail}.` };

  } catch (error) {
    console.error("Gagal mengirim undangan:", error);
    throw new HttpsError('internal', 'Gagal memproses undangan.');
  }
});


exports.completeSignup = onCall({ region: 'asia-southeast2' }, async (request) => {
  const { referralCode, password, name, phone, address } = request.data;

  if (!referralCode || !password || !name || !phone || !address) {
    throw new HttpsError('invalid-argument', 'Data pendaftaran tidak lengkap.');
  }

  const invitationRef = db.collection('invitations').doc(referralCode);

  return db.runTransaction(async (transaction) => {
    const invitationDoc = await transaction.get(invitationRef);

    if (!invitationDoc.exists || invitationDoc.data().status !== 'pending') {
      throw new HttpsError('not-found', 'Kode undangan tidak valid atau sudah digunakan.');
    }

    const invitationData = invitationDoc.data();

    // Buat pengguna di Firebase Authentication
    const userRecord = await admin.auth().createUser({
      email: invitationData.inviteeEmail,
      password: password,
      displayName: name,
    });

    // Set custom claims untuk peran dan ID representatif (pengundang)
    await admin.auth().setCustomUserClaims(userRecord.uid, {
      role: 'sales',
      representativeId: invitationData.inviterUid
    });

    // Buat profil pengguna di koleksi 'profiles'
    const profileRef = db.collection('profiles').doc(userRecord.uid);
    transaction.set(profileRef, {
      name: name,
      phone: formatIndonesianPhoneNumber(phone),
      address: address,
      email: invitationData.inviteeEmail,
      role: 'sales',
      referralId: invitationData.inviterUid,
      representativeId: invitationData.inviterUid, // Untuk sales, referral = representative
      createdAt: FieldValue.serverTimestamp(),
      accountType: 'user'
    });

    // Update status undangan
    transaction.update(invitationRef, { status: 'completed', completedAt: FieldValue.serverTimestamp() });

    return { success: true, message: 'Pendaftaran berhasil!' };
  });
});