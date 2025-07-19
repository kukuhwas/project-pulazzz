const fs = require('fs');
const path = require('path');

console.log('Memulai proses penggabungan data...');

// Tentukan path sumber dan tujuan
const sourceDir = path.join(__dirname, '..', 'data-import', 'api');
const targetDir = path.join(__dirname, '..', 'data-import');

function processDirectory(sourceSubDir, targetFileName) {
    const fullSourcePath = path.join(sourceDir, sourceSubDir);
    const targetFilePath = path.join(targetDir, targetFileName);
    let allData = [];

    try {
        console.log(`Membaca folder: ${fullSourcePath}...`);
        const files = fs.readdirSync(fullSourcePath);

        files.forEach(file => {
            if (file.endsWith('.json')) {
                const filePath = path.join(fullSourcePath, file);
                const fileContent = fs.readFileSync(filePath, 'utf8');
                const jsonData = JSON.parse(fileContent);
                allData = allData.concat(jsonData);
            }
        });

        fs.writeFileSync(targetFilePath, JSON.stringify(allData, null, 2));
        console.log(`✅ Berhasil membuat file ${targetFileName} dengan ${allData.length} data.`);

    } catch (error) {
        console.error(`❌ Gagal memproses ${sourceSubDir}:`, error.message);
    }
}

// Proses folder regencies menjadi cities.json
processDirectory('regencies', 'cities.json');

// Proses folder districts menjadi districts.json
processDirectory('districts', 'districts.json');

// Salin provinces.json ke direktori target agar lengkap
try {
    fs.copyFileSync(path.join(sourceDir, 'provinces.json'), path.join(targetDir, 'provinces.json'));
    console.log('✅ Berhasil menyalin provinces.json.');
} catch (error) {
    console.error('❌ Gagal menyalin provinces.json:', error.message);
}

console.log('🎉 Proses penggabungan data selesai!');