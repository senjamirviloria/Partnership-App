import { createCipheriv, createDecipheriv, pbkdf2Sync, randomBytes } from "node:crypto";

const TRANSPORT_SALT = "territory-api-transport-v1";
const TRANSPORT_ITERATIONS = 120000;

function normalizeSecret(secret: string) {
  return secret.trim().replace(/^['"]+|['"]+$/g, "");
}

export function getTransportSecret() {
  const serverSecret = process.env.TERRITORY_TRANSPORT_KEY;
  const publicSecret = process.env.NEXT_PUBLIC_TERRITORY_TRANSPORT_KEY;
  const normalizedServer = serverSecret ? normalizeSecret(serverSecret) : "";
  const normalizedPublic = publicSecret ? normalizeSecret(publicSecret) : "";

  if (normalizedServer && normalizedPublic && normalizedServer !== normalizedPublic) {
    throw new Error(
      "Transport key mismatch: TERRITORY_TRANSPORT_KEY and NEXT_PUBLIC_TERRITORY_TRANSPORT_KEY must match.",
    );
  }

  const secret = normalizedServer || normalizedPublic;
  if (!secret) {
    throw new Error("Missing TERRITORY_TRANSPORT_KEY (or NEXT_PUBLIC_TERRITORY_TRANSPORT_KEY).");
  }
  return secret;
}

function deriveTransportKey(userId: string) {
  const secret = getTransportSecret();
  return pbkdf2Sync(
    `${secret}:${userId}`,
    TRANSPORT_SALT,
    TRANSPORT_ITERATIONS,
    32,
    "sha256",
  );
}

export function encryptTransportPayloadForUser(userId: string, payload: unknown) {
  const key = deriveTransportKey(userId);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);

  const serialized = JSON.stringify(payload);
  const encrypted = Buffer.concat([
    cipher.update(serialized, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  // Web Crypto expects ciphertext with auth tag appended.
  const packed = Buffer.concat([iv, encrypted, tag]);
  return `enc:${packed.toString("base64")}`;
}

export function decryptTransportPayloadForUser<T = unknown>(userId: string, raw: string): T {
  if (!raw.startsWith("enc:")) {
    throw new Error("Encrypted transport payload is required.");
  }

  const packed = Buffer.from(raw.slice(4), "base64");
  if (packed.length <= 28) {
    throw new Error("Invalid encrypted transport payload.");
  }

  const key = deriveTransportKey(userId);
  const iv = packed.subarray(0, 12);
  const cipherText = packed.subarray(12, -16);
  const tag = packed.subarray(-16);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(cipherText), decipher.final()]).toString("utf8");
  return JSON.parse(decrypted) as T;
}

export const encryptTerritoryPayloadForUser = encryptTransportPayloadForUser;
