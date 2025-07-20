#!/bin/bash

# Script untuk memulai Firebase Emulators dan menjalankan seeding secara otomatis.

echo "Membuka dua jendela terminal untuk memulai proses..."

# Dapatkan path absolut dari direktori saat ini
PROJECT_PATH=$(pwd)

# Perintah untuk Terminal 1 (Emulator)
CMD_EMULATOR="cd '$PROJECT_PATH' && echo '🚀 Memulai Firebase Emulators...' && firebase emulators:start"

# Perintah untuk Terminal 2 (Seeding)
# Menambahkan jeda 15 detik untuk memberi waktu emulator siap sepenuhnya
CMD_SEED="cd '$PROJECT_PATH' && echo '⏳ Menunggu 15 detik agar emulator siap...' && sleep 15 && echo '🌱 Menjalankan skrip seeding...' && FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099' FIRESTORE_EMULATOR_HOST='127.0.0.1:8080' node functions/seed.js"

# Buka Terminal 1 dan jalankan perintah emulator
osascript -e "tell app \"Terminal\" to do script \"$CMD_EMULATOR\""

# Buka Terminal 2 dan jalankan perintah seeding
osascript -e "tell app \"Terminal\" to do script \"$CMD_SEED\""

echo "✅ Kedua proses telah dimulai di jendela terminal yang baru."