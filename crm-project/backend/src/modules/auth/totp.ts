import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "../../config/env.js";

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const encryptionKey = () => createHash("sha256").update(env.TOTP_ENCRYPTION_KEY ?? env.JWT_SECRET).digest();

export function sealTotpSecret(secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return "enc:v1:" + Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64");
}

export function openTotpSecret(value: string): string {
  if (!value.startsWith("enc:v1:")) return value;
  const packed = Buffer.from(value.slice(7), "base64");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), packed.subarray(0, 12));
  decipher.setAuthTag(packed.subarray(12, 28));
  return Buffer.concat([decipher.update(packed.subarray(28)), decipher.final()]).toString("utf8");
}

export function newTotpSecret(): string {
  const bytes = randomBytes(20);
  let bits = 0;
  let value = 0;
  let encoded = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      encoded += alphabet[(value >>> bits) & 31];
    }
  }
  if (bits) encoded += alphabet[(value << (5 - bits)) & 31];
  return encoded;
}

function decodeBase32(secret: string): Buffer {
  let bits = 0;
  let value = 0;
  const output: number[] = [];
  for (const char of secret.toUpperCase().replace(/=+$/g, "").replace(/\s/g, "")) {
    const index = alphabet.indexOf(char);
    if (index < 0) throw new Error("Chave do autenticador inválida");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      output.push((value >>> bits) & 255);
    }
  }
  return Buffer.from(output);
}

function codeAt(secret: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const digest = createHmac("sha1", decodeBase32(secret)).update(counter).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = ((digest[offset] & 0x7f) << 24) | ((digest[offset + 1] & 0xff) << 16) | ((digest[offset + 2] & 0xff) << 8) | (digest[offset + 3] & 0xff);
  return String(binary % 1_000_000).padStart(6, "0");
}

export function verifyTotp(secret: string, code: string, now = Date.now()): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  const supplied = Buffer.from(code);
  const currentStep = Math.floor(now / 30_000);
  for (const step of [currentStep - 1, currentStep, currentStep + 1]) {
    const expected = Buffer.from(codeAt(secret, step));
    if (supplied.length === expected.length && timingSafeEqual(supplied, expected)) return true;
  }
  return false;
}

export function totpUri(secret: string, email: string): string {
  const issuer = "Prysm CRM";
  const label = encodeURIComponent(issuer + ":" + email);
  const params = new URLSearchParams({ secret, issuer, algorithm: "SHA1", digits: "6", period: "30" });
  return "otpauth://totp/" + label + "?" + params.toString();
}
