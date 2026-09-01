export type PendingCapture = {
  id: string;
  audio: Blob;
  audioName: string;
  photo?: Blob;
  photoName?: string;
  transcript?: string;
};

const DB_NAME = "dovetails-promise-capture";
const STORE = "pending";
const memory = new Map<string, PendingCapture>();

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) {
          req.result.createObjectStore(STORE, { keyPath: "id" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function savePending(item: PendingCapture): Promise<void> {
  memory.set(item.id, item);
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
  db.close();
}

export async function removePending(id: string): Promise<void> {
  memory.delete(id);
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
  db.close();
}

export async function listPending(): Promise<PendingCapture[]> {
  const db = await openDb();
  if (!db) return [...memory.values()];
  const fromDb = await new Promise<PendingCapture[]>((resolve) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve((req.result as PendingCapture[]) ?? []);
    req.onerror = () => resolve([]);
  });
  db.close();
  for (const item of fromDb) memory.set(item.id, item);
  return [...memory.values()];
}
