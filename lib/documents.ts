import { digest, jsonBlob, type Evidence } from "./obligation";
const maxBytes = 2 * 1024 * 1024;
const allowed = ["application/pdf", "image/png", "image/jpeg", "text/plain"];
export function validateFile(file: File) {
  if (!file.size || file.size > maxBytes || !allowed.includes(file.type))
    throw Error("Choose a PDF, PNG, JPEG or text file up to 2 MB.");
}
async function db() {
  return new Promise<IDBDatabase>((yes, no) => {
    const r = indexedDB.open("aevumpay-documents-v1", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("files");
    r.onsuccess = () => yes(r.result);
    r.onerror = () => no(Error("Browser document storage is unavailable."));
  });
}
async function local(
  op: "read" | "write",
  key: string,
  value?: Blob,
): Promise<Blob | undefined> {
  const s = await db();
  return new Promise((yes, no) => {
    const t = s.transaction("files", op === "read" ? "readonly" : "readwrite");
    const req =
      op === "read"
        ? t.objectStore("files").get(key)
        : t.objectStore("files").put(value, key);
    t.oncomplete = () => {
      s.close();
      yes(op === "read" ? req.result : undefined);
    };
    t.onabort = t.onerror = () => {
      s.close();
      no(Error("The document could not be stored on this device."));
    };
  });
}
async function put(blob: Blob, cap?: string) {
  const hash = await digest(blob);
  if (cap) {
    const r = await fetch("/api/files/" + cap + "/" + hash, {
      method: "PUT",
      body: blob,
    });
    if (!r.ok)
      throw Error(
        "The shared evidence store could not save this file (" +
          r.status +
          ").",
      );
  } else await local("write", hash, blob);
  return hash;
}
export async function loadBlob(hash: string, cap?: string) {
  let b: Blob | undefined;
  if (cap) {
    const r = await fetch("/api/files/" + cap + "/" + hash, {
      cache: "no-store",
    });
    if (r.ok) b = await r.blob();
  } else b = await local("read", hash);
  if (!b || (await digest(b)) !== hash)
    throw Error(
      "The file is unavailable or its fingerprint does not match the order.",
    );
  return b;
}
export async function loadJSON<T>(hash: string, cap: string): Promise<T> {
  return JSON.parse(await (await loadBlob(hash, cap)).text());
}
export const putJSON = (v: unknown, cap?: string) => put(jsonBlob(v), cap);
export async function saveProof(
  file: File,
  note: string,
  reported: string,
  cap?: string,
) {
  validateFile(file);
  const fileHash = await put(file, cap);
  const evidence: Evidence = {
    name: file.name.slice(0, 130),
    type: file.type,
    size: file.size,
    fileHash,
    note: note.slice(0, 400),
    reported,
  };
  return { evidence, evidenceHash: await putJSON(evidence, cap) };
}
export function download(blob: Blob, name: string) {
  const u = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = u;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(u), 30000);
}
