const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const namespaceFile = path.join(__dirname, 'namespaces.json');
const openvpnConfigPath = process.argv[2]; // OpenVPN yapılandırma dosyasının yolu
const timeout = parseInt(process.argv[3], 10) || 60; // Süre sınırı, varsayılan olarak 3600 saniye (1 saat)

if (!openvpnConfigPath) {
    console.error('Lütfen OpenVPN yapılandırma dosyasının yolunu belirtin.');
    process.exit(1);
}

function loadNamespaceInfo() {
    if (fs.existsSync(namespaceFile)) {
        return JSON.parse(fs.readFileSync(namespaceFile, 'utf-8'));
    }
    return [];
}

function startOpenVPN(nsName, configPath) {
    const openvpn = spawn('ip', ['netns', 'exec', nsName, 'openvpn', '--config', configPath], { stdio: ['ignore', 'ignore', 'ignore'] });

    openvpn.on('error', (error) => {
        console.error(`${nsName} için OpenVPN bağlantısı başlatılırken hata oluştu:`, error.message);
    });

    openvpn.on('exit', (code, signal) => {
        if (signal) {
            console.log(`${nsName} için OpenVPN bağlantısı ${signal} sinyali ile durduruldu.`);
        } else if (code !== 0) {
            console.error(`${nsName} için OpenVPN bağlantısı hata kodu ${code} ile durduruldu.`);
        } else {
            console.log(`${nsName} için OpenVPN bağlantısı başarıyla durduruldu.`);
        }
    });

    return openvpn;
}

function connectAllNamespaces(configPath, duration) {
    const namespaces = loadNamespaceInfo();
    const openvpnProcesses = namespaces.map(ns => {
        const proc = startOpenVPN(ns.nsName, configPath);
        return {
            proc,
            nsName: ns.nsName,
            success: false // Başarı durumu başlangıçta false
        };
    });

    const startTime = Date.now(); // Bağlantı işlemi başlamadan önceki zaman damgası

    // Süre sınırını başlat
    setTimeout(() => {
        console.log('Süre doldu. Bağlantılar durduruluyor...');
        openvpnProcesses.forEach(({ proc, nsName }) => {
            proc.kill('SIGINT');
            if (!proc.killed) {
                console.error(`${nsName} için OpenVPN bağlantısı süresi dolmadan önce durdurulamadı.`);
            } else {
                // Başarı durumu kontrolü
                console.log(`${nsName} için OpenVPN bağlantısı başarıyla durduruldu.`);
            }
        });

        // Geçen süreyi hesapla
        const endTime = Date.now();
        const elapsedTime = Math.round((endTime - startTime) / 1000); // Geçen süreyi saniye cinsinden hesapla

        // Özet logu bastır
        const successCount = openvpnProcesses.filter(p => p.proc.killed).length;
        const failureCount = openvpnProcesses.length - successCount;

        console.log(`Özet: ${successCount} bağlantı başarılı oldu, ${failureCount} bağlantı başarısız oldu.`);
        console.log(`Toplam geçen süre: ${elapsedTime} saniye.`);
        process.exit();
    }, duration * 1000); // `duration` saniye cinsinden

    // Program kesilene kadar OpenVPN bağlantılarının devam etmesi için süreçleri takip et
    process.on('SIGINT', () => {
        console.log('Bağlantılar durduruluyor...');
        openvpnProcesses.forEach(({ proc, nsName }) => {
            proc.kill('SIGINT');
            if (!proc.killed) {
                console.error(`${nsName} için OpenVPN bağlantısı süresi dolmadan önce durdurulamadı.`);
            } else {
                console.log(`${nsName} için OpenVPN bağlantısı başarıyla durduruldu.`);
            }
        });

        process.exit();
    });

    // Terminalde 'q' girilince tüm süreçleri sonlandır
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    rl.on('line', (input) => {
        if (input.trim() === 'q') {
            console.log('Bağlantılar durduruluyor...');
            openvpnProcesses.forEach(({ proc, nsName }) => {
                proc.kill('SIGINT');
                if (!proc.killed) {
                    console.error(`${nsName} için OpenVPN bağlantısı süresi dolmadan önce durdurulamadı.`);
                } else {
                    console.log(`${nsName} için OpenVPN bağlantısı başarıyla durduruldu.`);
                }
            });
            process.exit();
        }
    });
}

// OpenVPN bağlantılarını başlat
connectAllNamespaces(openvpnConfigPath, timeout);
