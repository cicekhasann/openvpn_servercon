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

function createBridge() {
    try {
        disableUFW();
        configureSysctl();
        
        if (!checkBridgeExists('br0')) {
            execSync('ip link add name br0 type bridge');
            execSync('ip link set dev br0 up');
            execSync('ip addr add 192.168.0.1/16 dev br0');
            console.log('Bridge br0 başarıyla oluşturuldu.');
        } else {
            console.log('Bridge br0 zaten mevcut.');
        }
    } catch (error) {
        console.error('Bridge oluşturulurken hata oluştu:', error.message);
    }
}

function createNamespaceAndVeth(index) {
    const nsName = `vpnns${index}`;
    const vethHost = `ve${index}a`;
    const vethNs = `ve${index}b`;

    // Dinamik IP adresi hesaplama
    const baseIP = 192;
    const secondOctet = 168;
    const thirdOctet = Math.floor((index + 2) / 254);
    const lastOctet = (index + 2) % 254;

    const ipAddress = `${baseIP}.${secondOctet}.${thirdOctet}.${lastOctet}`;

    try {
        if (!checkNamespaceExists(nsName)) {
            execSync(`ip netns add ${nsName}`);
            execSync(`ip link add ${vethHost} type veth peer name ${vethNs}`);
            execSync(`ip link set ${vethNs} netns ${nsName}`);
            execSync(`ip netns exec ${nsName} ip link set ${vethNs} up`);
            execSync(`ip netns exec ${nsName} ip addr add ${ipAddress}/16 dev ${vethNs}`);
            execSync(`ip netns exec ${nsName} ip route add default via 192.168.0.1 dev ${vethNs}`);
            execSync(`ip link set ${vethHost} master br0`);
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
    createBridge();

    for (let i = 0; i < count; i++) {
        createNamespaceAndVeth(i);
    }
}

const numberOfClients = parseInt(process.argv[2], 10) || 10;
createMultipleNamespacesAndVeths(numberOfClients);
