const readline = require('readline');
const { execSync } = require('child_process');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function showMenu() {
    console.log('1. Hazırlık yap');
    console.log('2. Temizlik yap');
    console.log('3. Bağlantı yap');
    console.log('4. Çıkış');
}

function handleMenuOption(option) {
    switch(option) {
        case '1':
            rl.question('Kaç tane namespace oluşturmak istiyorsunuz? ', (count) => {
                execSync(`node hazirlik.js ${count}`, { stdio: 'inherit' });
                rl.close();
            });
            break;
        case '2':
            execSync('node temizlik.js', { stdio: 'inherit' });
            rl.close();
            break;
        case '3':
            execSync(`node baglanti.js "path"`, { stdio: 'inherit' });
	    process.exit();
            rl.question('OpenVPN yapılandırma dosyasının yolunu girin: ', (configPath) => {
                execSync(`node baglanti.js ${configPath}`, { stdio: 'inherit' });
                rl.close();
            });
            break;
        case '4':
            rl.close();
            break;
        default:
            console.log('Geçersiz seçenek. Lütfen tekrar deneyin.');
            showMenu();
            rl.question('Bir seçenek girin: ', handleMenuOption);
    }
}

showMenu();
rl.question('Bir seçenek girin: ', handleMenuOption);
