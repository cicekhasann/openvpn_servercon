const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const namespaceFile = path.join(__dirname, 'namespaces.json');

function loadNamespaceInfo() {
    if (fs.existsSync(namespaceFile)) {
        return JSON.parse(fs.readFileSync(namespaceFile, 'utf-8'));
    }
    return [];
}

function deleteNamespaceAndVeth(info) {
    try {
        execSync(`ip netns delete ${info.nsName}`);
        execSync(`ip link delete ${info.vethHost}`);
        console.log(`Namespace ve Veth ${info.nsName} başarıyla silindi.`);
    } catch (error) {
        console.error(`${info.nsName} silinirken hata oluştu:`, error.message);
    }
}

function deleteBridge(bridgeName) {
    try {
        execSync(`ip link delete ${bridgeName} type bridge`);
        console.log(`Bridge ${bridgeName} başarıyla silindi.`);
    } catch (error) {
        console.error(`Bridge ${bridgeName} silinirken hata oluştu:`, error.message);
    }
}

function cleanUp() {
    const namespaces = loadNamespaceInfo();
    namespaces.forEach(deleteNamespaceAndVeth);

    // 30 adet köprüyü sil
    for (let i = 0; i < 30; i++) {
        const bridgeName = `br${i}`;
        deleteBridge(bridgeName);
    }

    // namespace dosyasını sil
    if (fs.existsSync(namespaceFile)) {
        fs.unlinkSync(namespaceFile);
        console.log('Namespace bilgileri dosyası başarıyla silindi.');
    } else {
        console.log('Namespace bilgileri dosyası bulunamadı.');
    }
}

// Temizlik işlemini başlat
cleanUp();
