// public/js/invite.js

import { functions } from './firebase-config.js';
import { httpsCallable } from "https://www.gstatic.com/firebasejs/9.19.1/firebase-functions.js";

document.addEventListener('DOMContentLoaded', () => {

    const inviteForm = document.getElementById('invite-form');
    const inviteEmailInput = document.getElementById('invite-email');
    const submitButton = inviteForm.querySelector('button[type="submit"]');

    // Buat referensi ke Cloud Function
    const sendInvitation = httpsCallable(functions, 'sendInvitation');

    inviteForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        const email = inviteEmailInput.value;
        if (!email) {
            Swal.fire('Error', 'Alamat email tidak boleh kosong.', 'error');
            return;
        }

        // Nonaktifkan tombol dan tampilkan loading
        submitButton.disabled = true;
        submitButton.innerHTML = `<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Mengirim...`;

        try {
            // Panggil Cloud Function dengan email sebagai data
            const result = await sendInvitation({ inviteeEmail: email });

            // Tampilkan dialog sukses
            Swal.fire({
                icon: 'success',
                title: 'Berhasil!',
                text: result.data.message,
            });

            inviteForm.reset(); // Kosongkan form setelah berhasil

        } catch (error) {
            console.error('Gagal mengirim undangan:', error);
            // Tampilkan dialog error
            Swal.fire({
                icon: 'error',
                title: 'Oops...',
                text: `Terjadi kesalahan: ${error.message}`,
            });
        } finally {
            // Aktifkan kembali tombol
            submitButton.disabled = false;
            submitButton.innerHTML = `<i class="bi bi-send-fill"></i> Kirim Undangan`;
        }
    });

});
