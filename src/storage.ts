import type { Dataset, Run, SavedStrategy } from "./types";

const DB_NAME = "testify-local-v1";
type StoreName = "datasets" | "strategies" | "runs";
let dbPromise: Promise<IDBDatabase> | undefined;
function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const name of ["datasets", "strategies", "runs"] as StoreName[]) if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}
async function operation<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const req = fn(tx.objectStore(store));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    tx.onerror = () => reject(tx.error);
  });
}
export const localStore = {
  datasets: () => operation<Dataset[]>("datasets", "readonly", (s) => s.getAll()),
  dataset: (id: string) => operation<Dataset | undefined>("datasets", "readonly", (s) => s.get(id)),
  putDataset: (d: Dataset) => operation("datasets", "readwrite", (s) => s.put(d)),
  deleteDataset: (id: string) => operation("datasets", "readwrite", (s) => s.delete(id)),
  strategies: () => operation<SavedStrategy[]>("strategies", "readonly", (s) => s.getAll()),
  putStrategy: (s: SavedStrategy) => operation("strategies", "readwrite", (store) => store.put(s)),
  deleteStrategy: (id: string) => operation("strategies", "readwrite", (s) => s.delete(id)),
  runs: () => operation<Run[]>("runs", "readonly", (s) => s.getAll()),
  putRun: (r: Run) => operation("runs", "readwrite", (s) => s.put(r)),
  deleteRun: (id: string) => operation("runs", "readwrite", (s) => s.delete(id)),
  clearRuns: () => operation("runs", "readwrite", (s) => s.clear()),
};
