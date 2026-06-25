import { createCipheriv, createDecipheriv, pbkdf2Sync, randomBytes } from "node:crypto";
import { hashPassword, verifyPassword } from "better-auth/crypto";

const PASSWORD_HASH_PREFIX = "enc:v1:";
const PASSWORD_HASH_SALT = "partnership-app-password-hash-storage-v1";
const PASSWORD_HASH_ITERATIONS = 120000;

function normalizeSecret(secret: string) {
  return secret.trim().replace(/^['"]+|['"]+$/g, "");
}

function getPasswordHashEncryptionSecret() {
  const secret = process.env.PASSWORD_HASH_ENCRYPTION_KEY;
  const normalized = typeof secret === "string" ? normalizeSecret(secret) : "";
  if (!normalized) {
    throw new Error("Missing PASSWORD_HASH_ENCRYPTION_KEY.");
  }
  return normalized;
}

function derivePasswordHashKey() {
  return pbkdf2Sync(
    getPasswordHashEncryptionSecret(),
    PASSWORD_HASH_SALT,
    PASSWORD_HASH_ITERATIONS,
    32,
    "sha256",
  );
}

export function isEncryptedPasswordHash(value: string | null | undefined) {
  return typeof value === "string" && value.startsWith(PASSWORD_HASH_PREFIX);
}

export function encryptPasswordHash(hash: string) {
  const key = derivePasswordHashKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(hash, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PASSWORD_HASH_PREFIX}${Buffer.concat([iv, encrypted, tag]).toString("base64")}`;
}

export function decryptPasswordHash(encryptedHash: string) {
  if (!isEncryptedPasswordHash(encryptedHash)) {
    return encryptedHash;
  }

  const packed = Buffer.from(encryptedHash.slice(PASSWORD_HASH_PREFIX.length), "base64");
  if (packed.length <= 28) {
    throw new Error("Invalid encrypted password hash.");
  }

  const key = derivePasswordHashKey();
  const iv = packed.subarray(0, 12);
  const cipherText = packed.subarray(12, -16);
  const tag = packed.subarray(-16);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(cipherText), decipher.final()]).toString("utf8");
}

export async function hashPasswordForStorage(password: string) {
  return encryptPasswordHash(await hashPassword(password));
}

export async function verifyPasswordFromStorage({
  hash,
  password,
}: {
  hash: string;
  password: string;
}) {
  return verifyPassword({
    hash: decryptPasswordHash(hash),
    password,
  });
}
