const forge = require("node-forge");
const fs = require("fs");
const path = require("path");

const iosDir = path.join(__dirname, "..", "ios");
const password = process.argv[2] || "Edukamba2026";

// Read certificate (PEM or DER)
let certPem;
try {
  certPem = fs.readFileSync(path.join(iosDir, "certificate.pem"), "utf8");
} catch {
  // fallback: convert DER .cer to PEM
  const derBuf = fs.readFileSync(path.join(iosDir, "distribution.cer"));
  const b64 = derBuf.toString("base64").match(/.{1,64}/g).join("\n");
  certPem = `-----BEGIN CERTIFICATE-----\n${b64}\n-----END CERTIFICATE-----\n`;
}

const keyPem = fs.readFileSync(path.join(iosDir, "private.key"), "utf8");

const cert = forge.pki.certificateFromPem(certPem);
const key  = forge.pki.privateKeyFromPem(keyPem);

const p12Asn1 = forge.pkcs12.toPkcs12Asn1(key, [cert], password, {
  algorithm: "3des",
});
const p12Der = forge.asn1.toDer(p12Asn1).getBytes();
const p12Buf = Buffer.from(p12Der, "binary");

const outPath = path.join(iosDir, "edukamba_distribution.p12");
fs.writeFileSync(outPath, p12Buf);

console.log("✅ P12 criado em:", outPath);
console.log("🔑 Password:", password);

// Also output base64 for GitHub/Codemagic secrets
const b64 = p12Buf.toString("base64");
fs.writeFileSync(path.join(iosDir, "edukamba_distribution_p12_base64.txt"), b64);
console.log("📋 Base64 guardado em: ios/edukamba_distribution_p12_base64.txt");
