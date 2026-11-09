import { createCipheriv, createDecipheriv, createHmac, randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { env } from "../../config/env.js";

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export function newTotpSecret() {
  const bytes = randomBytes(20);
  let bits = "";
  for (const byte of bytes) bits += byte.toString(2).padStart(8, "0");
  let out = "";
  for (let i = 0; i < bits.length; i += 5) out += alphabet[parseInt(bits.slice(i, i + 5).padEnd(5, "0"), 2)];
  return out;
}
function decodeBase32(secret: string) {
  let bits = "";
  for (const char of secret.replace(/=|\s/g, "").toUpperCase()) {
    const n = alphabet.indexOf(char);
    if (n < 0) throw new Error("Segredo TOTP inválido");
    bits += n.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}
export function verifyTotp(secret: string, code: string, now = Date.now()) {
  if (!/^\d{6}$/.test(code)) return false;
  const counter = Math.floor(now / 30_000);
  for (let drift = -1; drift <= 1; drift++) {
    const msg = Buffer.alloc(8); msg.writeBigUInt64BE(BigInt(counter + drift));
    const digest = createHmac("sha1", decodeBase32(secret)).update(msg).digest();
    const offset = digest[digest.length - 1] & 15;
    const value = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
    const expected = Buffer.from(String(value).padStart(6, "0"));
    if (timingSafeEqual(expected, Buffer.from(code))) return true;
  }
  return false;
}
const key = () => createHash("sha256").update(env.TOTP_ENCRYPTION_KEY ?? env.JWT_SECRET).digest();
export function encryptTotp(secret: string) {
  const iv = randomBytes(12); const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return `${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${data.toString("base64url")}`;
}
export function decryptTotp(value: string) {
  const [iv, tag, data] = value.split("."); const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}
