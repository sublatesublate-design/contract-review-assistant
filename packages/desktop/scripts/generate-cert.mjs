import forge from 'node-forge';
import fs from 'fs';
import path from 'path';

export function generateCertKeys(outputDir) {
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    const keyPath = path.join(outputDir, 'localhost.key');
    const certPath = path.join(outputDir, 'localhost.crt');

    // 如果已经存在就跳过
    if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
        console.log('✅ 证书已存在，跳过生成');
        return;
    }

    console.log('⏳ 正在生成自签名 SSL 证书...');

    const keys = forge.pki.rsa.generateKeyPair(2048);
    const cert = forge.pki.createCertificate();

    cert.publicKey = keys.publicKey;
    cert.serialNumber = '01';
    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date();
    cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 10);

    const attrs = [
        { name: 'commonName', value: 'localhost' },
        { name: 'countryName', value: 'CN' },
        { shortName: 'ST', value: 'Beijing' },
        { name: 'localityName', value: 'Beijing' },
        { name: 'organizationName', value: 'Contract Review Assistant' },
        { shortName: 'OU', value: 'Development' }
    ];

    cert.setSubject(attrs);
    cert.setIssuer(attrs);

    cert.setExtensions([
        {
            name: 'basicConstraints',
            cA: true
        },
        {
            name: 'keyUsage',
            keyCertSign: true,
            digitalSignature: true,
            nonRepudiation: true,
            keyEncipherment: true,
            dataEncipherment: true
        },
        {
            name: 'extKeyUsage',
            serverAuth: true,
            clientAuth: true,
            codeSigning: true,
            emailProtection: true,
            timeStamping: true
        },
        {
            name: 'subjectAltName',
            altNames: [
                { type: 2, value: 'localhost' },
                { type: 7, ip: '127.0.0.1' }
            ]
        }
    ]);

    // 自签名
    cert.sign(keys.privateKey, forge.md.sha256.create());

    const pemKey = forge.pki.privateKeyToPem(keys.privateKey);
    const pemCert = forge.pki.certificateToPem(cert);

    fs.writeFileSync(keyPath, pemKey);
    fs.writeFileSync(certPath, pemCert);

    console.log('✅ 自签名证书生成完毕: ', outputDir);
}
