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

function deleteBridge() {
    try {
        execSync('ip link delete br0 type bridge');
        console.log('Bridge br0 başarıyla silindi.');
    } catch (error) {
        console.error('Bridge silinirken hata oluştu:', error.message);
    }
}

function cleanUp() {
    const namespaces = loadNamespaceInfo();
    namespaces.forEach(deleteNamespaceAndVeth);
    deleteBridge();
    fs.unlinkSync(namespaceFile);
}

// Temizlik işlemini başlat
cleanUp();
