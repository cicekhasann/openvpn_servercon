const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const namespaceFile = path.join(__dirname, 'namespaces.json');
const openvpnConfigPath = process.argv[2]; // OpenVPN yapılandırma dosyasının yolu
const timeout = parseInt(process.argv[3], 10) || 60; // Süre sınırı, varsayılan olarak 60 saniye

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

function startIperf3(nsName) {
    const port = 5201 + parseInt(nsName.replace('vpnns', ''), 10);
    const iperf3 = spawn('ip', ['netns', 'exec', nsName, 'iperf3', '-c', '10.2.1.78', '-p', port, '-J'], { stdio: ['pipe', 'pipe', 'pipe'] });

    let iperf3Output = '';

    iperf3.stdout.on('data', (data) => {
        iperf3Output += data.toString();
    });

    iperf3.stderr.on('data', (data) => {
        console.error(`${nsName} iperf3 hata: ${data.toString()}`);
    });

    iperf3.on('error', (error) => {
        console.error(`${nsName} için iperf3 başlatılırken hata oluştu:`, error.message);
    });

    return new Promise((resolve) => {
        iperf3.on('exit', (code, signal) => {
            if (signal) {
                console.log(`${nsName} için iperf3 ${signal} sinyali ile durduruldu.`);
            } else if (code !== 0) {
                console.error(`${nsName} için iperf3 hata kodu ${code} ile durduruldu.`);
            } else {
                console.log(`${nsName} için iperf3 başarıyla durduruldu.`);
                /* Her bir iperf3 çıktısı için ayrı ayrı yazdırılabilir. */
                console.log(`${nsName} iperf3 çıktısı:`);
                console.log(iperf3Output);
                resolve(iperf3Output);
            }
        });
    });
}

function parseIperf3Output(output) {
    try {
        const data = JSON.parse(output);
        const totalBytes = data.end.sum_received.bytes;
        const elapsedSeconds = data.end.sum_received.seconds;
        return (totalBytes * 8) / (elapsedSeconds * 1000000); // Mbps cinsinden
    } catch (error) {
        console.error('iperf3 çıktısını işlerken hata oluştu:', error.message);
        return 0;
    }
}

async function connectAllNamespaces(configPath, duration) {
    const namespaces = loadNamespaceInfo();
    const openvpnProcesses = namespaces.map(ns => {
        const proc = startOpenVPN(ns.nsName, configPath);
        return {
            proc,
            nsName: ns.nsName,
        };
    });

    const iperf3Promises = namespaces.map(ns => startIperf3(ns.nsName));

    const startTime = Date.now(); // Bağlantı işlemi başlamadan önceki zaman damgası

    // Süre sınırını başlat
    setTimeout(async () => {
        console.log('Süre doldu. Bağlantılar durduruluyor...');
        openvpnProcesses.forEach(({ proc, nsName }) => {
            proc.kill('SIGINT');
            if (!proc.killed) {
                console.error(`${nsName} için OpenVPN bağlantısı süresi dolmadan önce durdurulamadı.`);
            } else {
                console.log(`${nsName} için OpenVPN bağlantısı başarıyla durduruldu.`);
            }
        });

        const iperf3Outputs = await Promise.all(iperf3Promises);
        const throughputs = iperf3Outputs.map(parseIperf3Output);
        const averageThroughput = throughputs.reduce((acc, throughput) => acc + throughput, 0) / throughputs.length;

        // Geçen süreyi hesapla
        const endTime = Date.now();
        const elapsedTime = Math.round((endTime - startTime) / 1000); // Geçen süreyi saniye cinsinden hesapla

        // Özet logu bastır
        const successCount = openvpnProcesses.filter(p => p.proc.killed).length;
        const failureCount = openvpnProcesses.length - successCount;

        console.log(`Özet: ${successCount} bağlantı başarılı oldu, ${failureCount} bağlantı başarısız oldu.`);
        console.log(`Ortalama hız: ${averageThroughput.toFixed(2)} Mbps`);
        console.log(`Toplam geçen süre: ${elapsedTime} saniye.`);
        process.exit();
    }, duration * 1000); // `duration` saniye cinsinden

    // Program kesilene kadar OpenVPN ve iperf3 bağlantılarının devam etmesi için süreçleri takip et
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
