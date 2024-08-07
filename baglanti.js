const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const namespaceFile = path.join(__dirname, 'namespaces.json');
const logFilePath = path.join(__dirname, 'connection.log');
const openvpnConfigPath = process.argv[2];

if (!openvpnConfigPath) {
    console.error('Lütfen OpenVPN yapılandırma dosyasının yolunu belirtin.');
    process.exit(1);
}

function logMessage(message) {
    const timestamp = new Date().toISOString();
    fs.appendFileSync(logFilePath, `[${timestamp}] ${message}\n`);
}

function loadNamespaceInfo() {
    if (fs.existsSync(namespaceFile)) {
        return JSON.parse(fs.readFileSync(namespaceFile, 'utf-8'));
    }
    return [];
}

function startOpenVPN(nsName, configPath) {
    const openvpnProcess = spawn('ip', ['netns', 'exec', nsName, 'openvpn', '--config', configPath], { stdio: ['pipe', 'pipe', 'pipe'] });

    openvpnProcess.stdout.on('data', (data) => {
       // console.log(`[${nsName}] ${data.toString()}`);
        if (data.toString().includes('Initialization Sequence Completed')) {
            logMessage(`OpenVPN connection successful for namespace ${nsName}`);
        }
    });

    openvpnProcess.stderr.on('data', (data) => {
        console.error(`[${nsName}] ${data.toString()}`);
        logMessage(`OpenVPN error for namespace ${nsName}: ${data.toString()}`);
    });

    return openvpnProcess;
}

function startIperf3(nsName) {
    const port = 5201 + parseInt(nsName.replace('vpnns', ''), 10);
    const iperf3 = spawn('ip', ['netns', 'exec', nsName, 'iperf3', '-c', '10.2.1.78', '-p', port, '-t', '10', '-J'], { stdio: ['pipe', 'pipe', 'pipe'] });

    let iperf3Output = '';

    iperf3.stdout.on('data', (data) => {
        iperf3Output += data.toString();
    });

    return new Promise((resolve, reject) => {
        iperf3.on('exit', (code) => {
            if (code === 0) {
                resolve({ nsName, output: iperf3Output });
            } else {
                reject(new Error(`iperf3 süreci ${nsName} için hata kodu ${code} döndürdü`));
            }
        });
        iperf3.on('error', (err) => {
            reject(err);
        });
    });
}

async function connectAllNamespaces(configPath) {
    const namespaces = loadNamespaceInfo();
    const openvpnProcesses = namespaces.map(ns => ({ proc: startOpenVPN(ns.nsName, configPath), nsName: ns.nsName }));

    // Bekleme süresi
    await new Promise(resolve => setTimeout(resolve, 5000));

    const iperf3Promises = namespaces.map(ns => startIperf3(ns.nsName));

    try {
        const iperf3Outputs = await Promise.all(iperf3Promises);

        // OpenVPN süreçlerinin başarı durumunu kontrol et
        const successCount = openvpnProcesses.filter(p => p.proc.killed).length;
        const failureCount = openvpnProcesses.length - successCount;

        console.log(`Özet: ${successCount} bağlantı başarılı oldu, ${failureCount} bağlantı başarısız oldu.`);

        // Toplam trafik hesaplama
        let totalBitsPerSecond = 0;

        iperf3Outputs.forEach(({ nsName, output }) => {
            try {
                const data = JSON.parse(output);
                const bitsPerSecond = data.end.sum_received.bits_per_second;
                console.log(`${nsName} HIZ: ${bitsPerSecond} bits_per_second`);
                totalBitsPerSecond += bitsPerSecond; // Toplam trafik hesaplama
            } catch (error) {
                console.error(`${nsName} için iperf3 çıktısını işlerken hata oluştu:`, error.message);
                logMessage(`${nsName} için iperf3 çıktısını işlerken hata oluştu: ${error.message}`);
            }
        });

        // Megabite çevirme
        const totalMegabitsPerSecond = totalBitsPerSecond / 1e6;
        console.log(`Toplam trafik: ${totalBitsPerSecond} bits_per_second`);
        console.log(`Toplam trafik: ${totalMegabitsPerSecond} megabits_per_second`);
      //  logMessage(`Toplam trafik: ${totalBitsPerSecond} bits_per_second`);
       // logMessage(`Toplam trafik: ${totalMegabitsPerSecond} megabits_per_second`);

    } catch (error) {
        console.error('iperf3 süreçlerinde hata oluştu:', error.message);
        logMessage(`iperf3 süreçlerinde hata oluştu: ${error.message}`);
    } finally {
        openvpnProcesses.forEach(({ proc, nsName }) => {
            if (!proc.killed) {
                proc.kill();
                logMessage(`OpenVPN process killed for namespace ${nsName}`);
            }
        });
        process.exit();
    }
}

connectAllNamespaces(openvpnConfigPath);
