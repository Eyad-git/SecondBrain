import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

type EncodedBlob = {
  iv: string;
  tag: string;
  data: string;
};

function decodeKey(): Buffer {
  const raw = process.env.INTEGRATIONS_ENCRYPTION_KEY?.trim();
  if (!raw) {
    throw new Error("Missing INTEGRATIONS_ENCRYPTION_KEY.");
  }

  const maybeHex = /^[0-9a-fA-F]{64}$/.test(raw);
  const key = maybeHex ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(
      "INTEGRATIONS_ENCRYPTION_KEY must decode to 32 bytes (hex64 or base64)."
    );
  }
  return key;
}

export function encryptIntegrationSecret(plainText: string): string {
  const key = decodeKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plainText, "utf8"),
    cipher.final(),
  ]);
  const blob: EncodedBlob = {
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: encrypted.toString("base64"),
  };
  return JSON.stringify(blob);
}

export function decryptIntegrationSecret(cipherText: string): string {
  const key = decodeKey();
  const parsed = JSON.parse(cipherText) as EncodedBlob;
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(parsed.iv, "base64")
  );
  decipher.setAuthTag(Buffer.from(parsed.tag, "base64"));
  const out = Buffer.concat([
    decipher.update(Buffer.from(parsed.data, "base64")),
    decipher.final(),
  ]);
  return out.toString("utf8");
}

