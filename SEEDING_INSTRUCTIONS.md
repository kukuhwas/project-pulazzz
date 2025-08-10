# Instruksi untuk Seeding Pengguna ke Database Staging

Dokumen ini menjelaskan cara menjalankan skrip `seed-staging-users.js` untuk mengisi database Firebase Anda (misalnya, untuk lingkungan staging) dengan 25 data pengguna sampel.

## Prasyarat

1.  **Node.js**: Pastikan Anda telah menginstal Node.js di komputer Anda.
2.  **Kunci Akun Layanan (Service Account Key)**: Anda memerlukan file kunci akun layanan (dalam format JSON) dari proyek Firebase yang ingin Anda targetkan.

## Langkah-langkah

### 1. Dapatkan Kunci Akun Layanan Anda

- Buka [Konsol Firebase](https://console.firebase.google.com/).
- Pilih proyek Firebase Anda (misalnya, `project-pulazzz-staging-5b316`).
- Klik ikon roda gigi (Pengaturan) di sebelah "Project Overview" dan pilih **Project settings**.
- Buka tab **Service accounts**.
- Klik tombol **Generate new private key**.
- Sebuah file JSON akan diunduh ke komputer Anda. Simpan file ini di lokasi yang aman dan jangan pernah membagikannya atau menambahkannya ke repositori Git.

### 2. Instal Dependensi

Skrip ini memerlukan beberapa dependensi. Buka terminal atau command prompt, navigasikan ke direktori `functions` proyek ini, dan jalankan perintah berikut:

```bash
cd functions
npm install
```

### 3. Atur Variabel Lingkungan

Skrip menggunakan variabel lingkungan bernama `GOOGLE_APPLICATION_CREDENTIALS` untuk menemukan file kunci akun layanan Anda. Anda perlu mengatur variabel ini ke path absolut dari file JSON yang Anda unduh pada Langkah 1.

**Untuk macOS/Linux:**
```bash
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/your/serviceAccountKey.json"
```
*Ganti `/path/to/your/serviceAccountKey.json` dengan path sebenarnya.*

**Untuk Windows (PowerShell):**
```powershell
$env:GOOGLE_APPLICATION_CREDENTIALS="C:\path\to\your\serviceAccountKey.json"
```
*Ganti `C:\path\to\your\serviceAccountKey.json` dengan path sebenarnya.*

**Penting:** Variabel lingkungan ini hanya berlaku untuk sesi terminal saat ini. Jika Anda membuka terminal baru, Anda perlu mengaturnya lagi.

### 4. Jalankan Skrip Seeding

Setelah variabel lingkungan diatur, Anda siap untuk menjalankan skrip. Pastikan Anda masih berada di dalam direktori `functions`, lalu jalankan perintah berikut:

```bash
node seed-staging-users.js
```

Skrip akan mulai berjalan dan mencetak log kemajuannya ke terminal. Proses ini akan membuat 25 pengguna baru di Firebase Authentication dan profil yang sesuai di Firestore.

Jika berhasil, Anda akan melihat pesan "Proses seeding selesai!". Jika terjadi kesalahan, skrip akan berhenti dan menampilkan pesan kesalahan.
