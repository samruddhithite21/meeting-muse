// AES-GCM encryption helpers + SHA-256 integrity hashing.
// The encryption key is derived from a user passphrase and stored only in memory + localStorage (not on the server).
// The server stores only ciphertext + IV + a fingerprint of the key for sanity checking.

const KEY_STORAGE = "ami_enc_key_v1";
const FP_STORAGE = "ami_enc_fp_v1";

function b64encode(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function b64decode(s: string): Uint8Array {
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export async function sha256Hex(data: ArrayBuffer | string): Promise<string> {
  const ab: ArrayBuffer =
    typeof data === "string"
      ? (new TextEncoder().encode(data).buffer.slice(0) as ArrayBuffer)
      : data;
  const hashBuf = await crypto.subtle.digest("SHA-256", ab);
  return Array.from(new Uint8Array(hashBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function deriveKey(passphrase: string, saltStr = "ami-salt-v1"): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(passphrase),
    { name: "PBKDF2" },
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: enc.encode(saltStr),
      iterations: 200_000,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
}

export async function exportKeyFingerprint(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey("raw", key);
  return (await sha256Hex(raw)).slice(0, 16);
}

let inMemoryKey: CryptoKey | null = null;

export async function unlockKey(passphrase: string): Promise<{ key: CryptoKey; fingerprint: string }> {
  const key = await deriveKey(passphrase);
  const fingerprint = await exportKeyFingerprint(key);
  inMemoryKey = key;
  // store base64 raw key in localStorage so the user doesn't have to retype every reload (trade-off: device must be trusted)
  const raw = await crypto.subtle.exportKey("raw", key);
  localStorage.setItem(KEY_STORAGE, b64encode(raw));
  localStorage.setItem(FP_STORAGE, fingerprint);
  return { key, fingerprint };
}

export async function loadStoredKey(): Promise<CryptoKey | null> {
  if (inMemoryKey) return inMemoryKey;
  const stored = localStorage.getItem(KEY_STORAGE);
  if (!stored) return null;
  const raw = b64decode(stored).buffer.slice(0) as ArrayBuffer;
  const key = await crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, true, ["encrypt", "decrypt"]);
  inMemoryKey = key;
  return key;
}

export function lockKey() {
  inMemoryKey = null;
  localStorage.removeItem(KEY_STORAGE);
  localStorage.removeItem(FP_STORAGE);
}

export function getStoredFingerprint(): string | null {
  return localStorage.getItem(FP_STORAGE);
}

export async function encryptText(text: string, key?: CryptoKey): Promise<{ ciphertext: string; iv: string }> {
  const k = key ?? (await loadStoredKey());
  if (!k) throw new Error("Encryption key not unlocked");
  const ivBytes = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder().encode(text);
  const iv = ivBytes.buffer.slice(0) as ArrayBuffer;
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, k, enc);
  return { ciphertext: b64encode(ct), iv: b64encode(iv) };
}

export async function decryptText(ciphertext: string, iv: string, key?: CryptoKey): Promise<string> {
  const k = key ?? (await loadStoredKey());
  if (!k) throw new Error("Encryption key not unlocked");
  const ct = b64decode(ciphertext);
  const ivBuf = b64decode(iv);
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: ivBuf.buffer.slice(0) as ArrayBuffer },
    k,
    ct.buffer.slice(0) as ArrayBuffer,
  );
  return new TextDecoder().decode(pt);
}

export async function encryptBlob(blob: Blob, key?: CryptoKey): Promise<{ blob: Blob; iv: string; hash: string }> {
  const k = key ?? (await loadStoredKey());
  if (!k) throw new Error("Encryption key not unlocked");
  const ab = await blob.arrayBuffer();
  const hash = await sha256Hex(ab);
  const ivBytes = crypto.getRandomValues(new Uint8Array(12));
  const iv = ivBytes.buffer.slice(0) as ArrayBuffer;
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, k, ab);
  return { blob: new Blob([ct]), iv: b64encode(iv), hash };
}

export async function decryptBlob(blob: Blob, iv: string, mime: string, key?: CryptoKey): Promise<Blob> {
  const k = key ?? (await loadStoredKey());
  if (!k) throw new Error("Encryption key not unlocked");
  const ab = await blob.arrayBuffer();
  const ivBuf = b64decode(iv);
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: ivBuf.buffer.slice(0) as ArrayBuffer },
    k,
    ab,
  );
  return new Blob([pt], { type: mime });
}
