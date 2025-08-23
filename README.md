# Sistem Pemesanan Pulazzz

Aplikasi web internal untuk manajemen pemesanan, pelanggan, dan pengguna untuk Pulazzz. Dibangun dengan Firebase dan Vanilla JavaScript, aplikasi ini memisahkan lingkungan kerja antara **Production**, **Staging**, dan **Local Development** untuk memastikan alur kerja yang aman dan efisien.

## Fitur Utama

-   **Autentikasi & Otorisasi**: Sistem login, pendaftaran khusus via undangan, dan reset password.
-   **Manajemen Pengguna Berbasis Peran**:
    -   **Admin**: Kontrol penuh atas pengguna dan pesanan.
    -   **Representatif**: Mengelola reseller di bawahnya dan membuat pesanan.
    -   **Reseller**: Membuat pesanan.
    -   **Produksi**: Melihat dan memproses pesanan.
-   **Sistem Undangan**: Admin dan Representatif dapat mengundang pengguna baru melalui email.
-   **Formulir Pemesanan Dinamis**: Termasuk pencarian alamat (kecamatan/kota), keranjang belanja, dan opsi produk kustom untuk Admin.
-   **Dashboard Pemesanan**: Tampilan daftar pesanan dengan filter status, *infinite scroll*, dan kemampuan untuk mengubah status pesanan.
-   **Manajemen Profil**: Pengguna dapat melihat dan mengubah data profil mereka.
-   **Generasi Invoice PDF**: Kemampuan untuk mencetak invoice pesanan dalam format PDF.

## Tumpukan Teknologi

-   **Frontend**: HTML5, CSS3, Bootstrap 5, Vanilla JavaScript (ES Modules), TomSelect.js, SweetAlert2.
-   **Backend**: Firebase
    -   **Firebase Authentication**: Untuk manajemen pengguna.
    -   **Firestore**: Sebagai database NoSQL.
    -   **Cloud Functions for Firebase**: Untuk logika backend (misalnya, membuat pesanan, mengirim undangan, validasi peran).
-   **Tools**: Firebase CLI, Node.js (untuk Cloud Functions dan skrip).

---

## Struktur Lingkungan & Penerapan

Aplikasi ini dirancang untuk berjalan di tiga lingkungan yang berbeda: Lokal (Emulator), Staging, dan Produksi. Pemilihan konfigurasi Firebase yang sesuai dilakukan secara otomatis di sisi klien.

### Cara Kerja Pemilihan Lingkungan

Logika utama berada di `/public/js/firebase-config.js`. Skrip ini mendeteksi `hostname` dari browser untuk menentukan konfigurasi Firebase mana yang akan digunakan.

```javascript
// Pilih konfigurasi berdasarkan hostname
const currentHostname = window.location.hostname;
const stagingHostnames = ["project-pulazzz-staging-5b316.firebaseapp.com", "project-pulazzz-staging-5b316.web.app"];
const isStaging = stagingHostnames.includes(currentHostname);

const firebaseConfig = isStaging ? stagingConfig : productionConfig;

// ... inisialisasi Firebase ...

// Cek jika kita berada di lingkungan lokal (emulator)
if (window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost") {
    console.log("Mode development: Menghubungkan ke Firebase Emulators...");
    connectAuthEmulator(auth, "http://127.0.0.1:9099");
    connectFirestoreEmulator(db, "127.0.0.1", 8080);
    connectFunctionsEmulator(functions, "127.0.0.1", 5001);
}
```

### Detail Lingkungan

| Lingkungan | Hostname | Firebase Project | Tujuan |
| :--- | :--- | :--- | :--- |
| **Produksi** | `project-pulazzz.web.app` | `project-pulazzz` | Aplikasi live yang digunakan oleh pengguna akhir. |
| **Staging** | `project-pulazzz-staging-5b316.web.app` | `project-pulazzz-staging-5b316` | Untuk pengujian fitur baru sebelum dirilis ke produksi. Memiliki database dan pengguna terpisah. |
| **Lokal** | `127.0.0.1` atau `localhost` | Firebase Emulators | Untuk pengembangan dan pengujian di mesin lokal tanpa memengaruhi data Staging/Produksi. |

---

## Panduan Memulai (Pengembangan Lokal)

Ikuti langkah-langkah ini untuk menjalankan proyek di lingkungan pengembangan lokal Anda.

### 1. Prasyarat

-   Node.js (versi LTS direkomendasikan)
-   Firebase CLI. Instal secara global:
    ```bash
    npm install -g firebase-tools
    ```

### 2. Instalasi

1.  **Clone repository ini:**
    ```bash
    git clone https://github.com/username/project-pulazzz.git
    cd project-pulazzz
    ```

2.  **Login ke Firebase:**
    ```bash
    firebase login
    ```

3.  **Instal dependensi untuk Cloud Functions:**
    ```bash
    cd functions
    npm install
    cd ..
    ```

### 3. Menjalankan Aplikasi dengan Emulator

Proyek ini dilengkapi dengan skrip untuk mempermudah proses memulai emulator dan melakukan *seeding* data awal.

-   **Jalankan skrip `start-and-seed.sh`:**
    ```bash
    ./start-and-seed.sh
    ```
    Skrip ini akan:
    1.  Membuka jendela terminal baru dan memulai Firebase Emulators (Auth, Firestore, Functions, Hosting).
    2.  Membuka jendela terminal kedua, menunggu 15 detik, lalu menjalankan `functions/seed.js` untuk mengisi data awal (pengguna admin, produk, dll.) ke emulator.

-   Setelah emulator berjalan, aplikasi akan tersedia di **`http://127.0.0.1:5000`**.
-   Firebase Emulator UI akan tersedia di **`http://127.0.0.1:4000`**.
