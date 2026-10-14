import type { Dataset, Run, SavedStrategy } from "./types";

export function createLocalStore(userId: string) {
  if (!userId || !/^[A-Za-z0-9_-]{1,128}$/.test(userId)) throw new Error("A valid workspace identity is required.");
  const DB_NAME = `testify-user-${userId}`;
  type StoreName = "datasets" | "strategies" | "runs";
  let dbPromise: Promise<IDBDatabase> | undefined;
  function openDb(): Promise<IDBDatabase> {
    if (!dbPromise) dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        for (const name of ["datasets", "strategies", "runs"] as StoreName[]) if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: "id" });
      };
      request.onsuccess = () => {
        request.result.onversionchange = () => {
          request.result.close();
          dbPromise = undefined;
        };
        resolve(request.result);
      };
      request.onerror = () => reject(request.error);
    }).catch((error) => {
      dbPromise = undefined;
      throw error;
    });
    return dbPromise;
  }
  async function operation<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      let tx: IDBTransaction;
      try {
        tx = db.transaction(store, mode);
      } catch (error) {
        dbPromise = undefined;
        reject(error);
        return;
      }
      let result: T;
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(tx.error || new Error("Browser storage could not finish this change. Check available browser storage and try again."));
      try {
        const req = fn(tx.objectStore(store));
        req.onsuccess = () => { result = req.result; };
      } catch (error) {
        tx.abort();
        reject(error);
      }
    });
  }
  const store = {
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

  return store;
}
