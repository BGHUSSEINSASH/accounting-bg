import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const OID_SHA256_WITH_RSA = '1.2.840.113549.1.1.11';
const OID_RSA_ENCRYPTION = '1.2.840.113549.1.1.1';
const OID_COMMON_NAME = '2.5.4.3';
const OID_BASIC_CONSTRAINTS = '2.5.29.19';

function derTag(tag: number, content: Buffer): Buffer {
  const len = content.length;
  if (len < 128) return Buffer.concat([Buffer.from([tag, len]), content]);
  const bytes: number[] = [];
  let l = len;
  while (l > 0) { bytes.unshift(l & 0xff); l >>= 8; }
  return Buffer.concat([Buffer.from([tag, 0x80 | bytes.length, ...bytes]), content]);
}

function derSequence(contents: Buffer[]): Buffer {
  return derTag(0x30, Buffer.concat(contents));
}

function derSet(contents: Buffer[]): Buffer {
  return derTag(0x31, Buffer.concat(contents));
}

function derInteger(value: number): Buffer {
  const bytes: number[] = [];
  let v = value;
  while (v > 0) { bytes.unshift(v & 0xff); v >>= 8; }
  if (bytes.length === 0) bytes.push(0);
  if (bytes[0] & 0x80) bytes.unshift(0);
  return derTag(0x02, Buffer.from(bytes));
}

function derIntegerBytes(bytes: Buffer): Buffer {
  if (bytes[0] & 0x80) return derTag(0x02, Buffer.concat([Buffer.from([0x00]), bytes]));
  return derTag(0x02, bytes);
}

function derOID(oid: string): Buffer {
  const parts = oid.split('.').map(Number);
  const bytes: number[] = [];
  bytes.push(parts[0] * 40 + parts[1]);
  for (let i = 2; i < parts.length; i++) {
    let v = parts[i];
    const vbytes: number[] = [];
    do { vbytes.unshift(v & 0x7f); v >>= 7; } while (v > 0);
    for (let j = 0; j < vbytes.length - 1; j++) { vbytes[j] |= 0x80; }
    bytes.push(...vbytes);
  }
  return derTag(0x06, Buffer.from(bytes));
}

function derUTF8String(value: string): Buffer {
  return derTag(0x0c, Buffer.from(value, 'utf8'));
}

function derUTCTime(date: Date): Buffer {
  const str = date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '') + 'Z';
  return derTag(0x17, Buffer.from(str, 'utf8'));
}

function derBitString(content: Buffer): Buffer {
  return derTag(0x03, Buffer.concat([Buffer.from([0x00]), content]));
}

function derOctetString(content: Buffer): Buffer {
  return derTag(0x04, content);
}

function derNull(): Buffer {
  return Buffer.from([0x05, 0x00]);
}

function derBoolean(value: boolean): Buffer {
  return derTag(0x01, Buffer.from([value ? 0xff : 0x00]));
}

function derContextExplicit(tag: number, content: Buffer): Buffer {
  return derTag(0xa0 | tag, content);
}

function derNameEntry(oid: string, value: string): Buffer {
  return derSequence([derOID(oid), derUTF8String(value)]);
}

function derName(entries: { oid: string; value: string }[]): Buffer {
  const sets = entries.map(e => derSet([derNameEntry(e.oid, e.value)]));
  return derSequence(sets);
}

function derAlgorithmIdentifier(oid: string): Buffer {
  return derSequence([derOID(oid), derNull()]);
}

function formatPEM(der: Buffer, label: string): string {
  const b64 = der.toString('base64');
  const lines = b64.match(/.{1,64}/g) || [];
  return `-----BEGIN ${label}-----\n${lines.join('\n')}\n-----END ${label}-----`;
}

export function generateSelfSignedCert(certDir: string): { keyPath: string; certPath: string } {
  const keyPath = path.join(certDir, 'key.pem');
  const certPath = path.join(certDir, 'cert.pem');

  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  const spkiDer = crypto.createPublicKey(publicKey).export({ type: 'spki', format: 'der' });

  const notBefore = new Date();
  const notAfter = new Date();
  notAfter.setFullYear(notAfter.getFullYear() + 10);

  const serialBytes = crypto.randomBytes(16);

  const tbsCert = derSequence([
    derContextExplicit(0, derInteger(2)),
    derIntegerBytes(serialBytes),
    derAlgorithmIdentifier(OID_SHA256_WITH_RSA),
    derName([{ oid: OID_COMMON_NAME, value: 'localhost' }]),
    derSequence([derUTCTime(notBefore), derUTCTime(notAfter)]),
    derName([{ oid: OID_COMMON_NAME, value: 'localhost' }]),
    spkiDer,
    derContextExplicit(3, derSequence([
      derSequence([
        derOID(OID_BASIC_CONSTRAINTS),
        derBoolean(true),
        derOctetString(derSequence([derBoolean(true)])),
      ]),
    ])),
  ]);

  const signer = crypto.createSign('sha256');
  signer.update(tbsCert);
  const signatureValue = signer.sign(privateKey);

  const certDer = derSequence([
    tbsCert,
    derAlgorithmIdentifier(OID_SHA256_WITH_RSA),
    derBitString(signatureValue),
  ]);

  fs.mkdirSync(certDir, { recursive: true });
  fs.writeFileSync(keyPath, privateKey);
  fs.writeFileSync(certPath, formatPEM(certDer, 'CERTIFICATE'));

  return { keyPath, certPath };
}
