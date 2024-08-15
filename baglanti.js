const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const namespaceFile = path.join(__dirname, 'namespaces.json');
const logFilePath = path.join(__dirname, 'connection.log');
const openvpnConfigPath = process.argv[2];
const TIMEOUT = 15000; // 10 seconds timeout

if (!openvpnConfigPath) {
    console.error('Please specify the path to the OpenVPN configuration file.');
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
    return new Promise((resolve, reject) => {
        const openvpnProcess = spawn('ip', ['netns', 'exec', nsName, 'openvpn', '--config', configPath], { stdio: ['pipe', 'pipe', 'pipe'] });

        let initialized = false;

        openvpnProcess.stdout.on('data', (data) => {
            //console.log(`[${nsName}] ${data.toString()}`);
            if (data.toString().includes('Initialization Sequence Completed')) {
                logMessage(`OpenVPN connection successful for namespace ${nsName}`);
                initialized = true;
                resolve(openvpnProcess);
            }
        });

        openvpnProcess.stderr.on('data', (data) => {
            console.error(`[${nsName}] ${data.toString()}`);
            logMessage(`OpenVPN error for namespace ${nsName}: ${data.toString()}`);
        });

        openvpnProcess.on('error', (err) => {
            reject(err);
        });

        // Timeout after TIMEOUT ms to force kill the OpenVPN process
        setTimeout(() => {
            if (!initialized) {
                if (!openvpnProcess.killed) {
                    openvpnProcess.kill();
                    logMessage(`OpenVPN process killed for namespace ${nsName} after ${TIMEOUT / 1000} seconds.`);
                    resolve(openvpnProcess); // Resolve even if killed to allow continuation
                }
            }
        }, TIMEOUT);
    });
}

function startIperf3(nsName) {
    return new Promise((resolve, reject) => {
        const port = 5201 + parseInt(nsName.replace('vpnns', ''), 10);
        const iperf3Process = spawn('ip', ['netns', 'exec', nsName, 'iperf3', '-c', '172.17.100.1', '-p', port, '-t', '10', '-J'], { stdio: ['pipe', 'pipe', 'pipe'] });

        let iperf3Output = '';

        iperf3Process.stdout.on('data', (data) => {
            iperf3Output += data.toString();
        });

        iperf3Process.on('exit', (code) => {
            if (code === 0) {
                resolve({ nsName, output: iperf3Output });
            } else {
                reject(new Error(`iperf3 process for ${nsName} exited with code ${code}`));
            }
        });

        iperf3Process.on('error', (err) => {
            reject(err);
        });
    });
}

async function connectAllNamespaces(configPath) {
    const namespaces = loadNamespaceInfo();

    // Start all OpenVPN processes in parallel
    const openvpnPromises = namespaces.map(ns => startOpenVPN(ns.nsName, configPath));

    try {
        // Wait for all OpenVPN processes to initialize or timeout
        const openvpnProcesses = await Promise.all(openvpnPromises);
        console.log('All OpenVPN processes started or timed out.');

        // Start all iperf3 processes in parallel
        const iperf3Promises = namespaces.map(ns => startIperf3(ns.nsName));
        const iperf3Results = await Promise.all(iperf3Promises);

        let totalBitsPerSecond = 0;

        // Process iperf3 results
        iperf3Results.forEach(({ nsName, output }) => {
            try {
                const data = JSON.parse(output);
                const bitsPerSecond = data.end.sum_received.bits_per_second;
                console.log(`${nsName} SPEED: ${bitsPerSecond} bits_per_second`);
                totalBitsPerSecond += bitsPerSecond;
            } catch (error) {
                console.error(`${nsName} iperf3 output parsing error: ${error.message}`);
                logMessage(`${nsName} iperf3 output parsing error: ${error.message}`);
            }
        });

        const totalMegabitsPerSecond = totalBitsPerSecond / 1e6;
        console.log(`Total traffic: ${totalBitsPerSecond} bits_per_second`);
        console.log(`Total traffic: ${totalMegabitsPerSecond} megabits_per_second`);
        logMessage(`Total traffic: ${totalBitsPerSecond} bits_per_second`);
        logMessage(`Total traffic: ${totalMegabitsPerSecond} megabits_per_second`);

    } catch (error) {
        console.error('An error occurred:', error.message);
        logMessage(`An error occurred: ${error.message}`);
    } finally {
        // Clean up OpenVPN processes
        openvpnPromises.forEach(promise => {
            promise.then(proc => {
                if (!proc.killed) {
                    proc.kill();
                    logMessage(`OpenVPN process killed after iperf3 test.`);
                }
            });
        });
        process.exit();
    }
}

connectAllNamespaces(openvpnConfigPath);
