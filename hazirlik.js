const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const namespaceFile = path.join(__dirname, 'namespaces.json');

function saveNamespaceInfo(info) {
    let namespaces = [];
    if (fs.existsSync(namespaceFile)) {
        namespaces = JSON.parse(fs.readFileSync(namespaceFile, 'utf-8'));
    }
    namespaces.push(info);
    fs.writeFileSync(namespaceFile, JSON.stringify(namespaces, null, 2));
}

function disableUFW() {
    try {
        execSync('ufw disable');
        console.log('UFW devre dışı bırakıldı.');
    } catch (error) {
        console.error('UFW devre dışı bırakılırken hata oluştu:', error.message);
    }
}

function configureSysctl() {
    try {
        execSync('sysctl -w net.ipv4.ip_forward=1');
        console.log('IP forwarding etkinleştirildi.');
    } catch (error) {
        console.error('sysctl ayarları yapılırken hata oluştu:', error.message);
    }
}

function checkBridgeExists(bridgeName) {
    try {
        execSync(`ip link show ${bridgeName}`);
        return true;
    } catch (error) {
        return false;
    }
}

function checkNamespaceExists(nsName) {
    try {
        execSync(`ip netns list | grep ${nsName}`);
        return true;
    } catch (error) {
        return false;
    }
}

function createBridge(bridgeIndex) {
    const bridgeName = `br${bridgeIndex}`;
    const baseIP = 192;
    const secondOctet = 168;
    const thirdOctet = bridgeIndex * 4; // Her bridge için üçüncü okteti 4'er artır

    const bridgeIP = `${baseIP}.${secondOctet}.${thirdOctet}.1/22`;

    try {
        disableUFW();
        configureSysctl();

        if (!checkBridgeExists(bridgeName)) {
            execSync(`ip link add name ${bridgeName} type bridge`);
            execSync(`ip link set dev ${bridgeName} up`);
            execSync(`ip addr add ${bridgeIP} dev ${bridgeName}`);
            console.log(`Bridge ${bridgeName} başarıyla oluşturuldu.`);
        } else {
            console.log(`Bridge ${bridgeName} zaten mevcut.`);
        }
    } catch (error) {
        console.error(`Bridge ${bridgeName} oluşturulurken hata oluştu:`, error.message);
    }
}

function createNamespaceAndVeth(index, bridgeIndex) {
    const nsName = `vpnns${index}`;
    const vethHost = `ve${index}a`;
    const vethNs = `ve${index}b`;

    const baseIP = 192;
    const secondOctet = 168;
    const thirdOctet = bridgeIndex * 4; // Her köprü için üçüncü okteti 4'er artır
    const fourthOctet = (index % 1000) + 2; // Dördüncü okteti 1 ile 1024 arasında tutun

    // Eğer lastOctet 255'i geçerse, üçüncü oktet artırılmalı
    const finalThirdOctet = thirdOctet + Math.floor((index % 1000) / 252);
    const finalFourthOctet = (fourthOctet - 1) % 252 + 2;
    const ipAddress = `${baseIP}.${secondOctet}.${finalThirdOctet}.${finalFourthOctet}`;
    try {
        if (!checkNamespaceExists(nsName)) {
            execSync(`ip netns add ${nsName}`);
            execSync(`ip link add ${vethHost} type veth peer name ${vethNs}`);
            execSync(`ip link set ${vethNs} netns ${nsName}`);
            execSync(`ip netns exec ${nsName} ip link set ${vethNs} up`);
            execSync(`ip netns exec ${nsName} ip addr add ${ipAddress}/22 dev ${vethNs}`);
            execSync(`ip netns exec ${nsName} ip route add default via ${baseIP}.${secondOctet}.${thirdOctet}.1 dev ${vethNs}`);
            execSync(`ip link set ${vethHost} master br${bridgeIndex}`);
            execSync(`ip link set ${vethHost} up`);

            saveNamespaceInfo({ nsName, vethHost, vethNs });
            console.log(`Namespace ve Veth ${nsName} başarıyla oluşturuldu.`);
        } else {
            console.log(`Namespace ${nsName} zaten mevcut.`);
        }
    } catch (error) {
        console.error(`${nsName} oluşturulurken hata oluştu:`, error.message);
    }
}

function createMultipleNamespacesAndVeths(count) {
    const maxNamespacesPerBridge = 1000;
    const totalBridges = Math.ceil(count / maxNamespacesPerBridge);

    for (let i = 0; i < totalBridges; i++) {
        createBridge(i);
    }

    for (let i = 0; i < count; i++) {
        const bridgeIndex = Math.floor(i / maxNamespacesPerBridge);
        createNamespaceAndVeth(i, bridgeIndex);
    }
}

const numberOfClients = parseInt(process.argv[2], 10) || 10;
createMultipleNamespacesAndVeths(numberOfClients);
