function createLocalStore(userId) {
  if (!userId || !/^[A-Za-z0-9_-]{1,128}$/.test(userId)) throw new Error("A valid workspace identity is required.");
  const DB_NAME = `testify-user-${userId}`;
  let dbPromise;
  function openDb() {
    if (!dbPromise) dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        for (const name of ["datasets", "strategies", "runs"]) if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: "id" });
      };
      request.onsuccess = () => {
        request.result.onversionchange = () => {
          request.result.close();
          dbPromise = void 0;
        };
        resolve(request.result);
      };
      request.onerror = () => reject(request.error);
    }).catch((error) => {
      dbPromise = void 0;
      throw error;
    });
    return dbPromise;
  }
  async function operation(store2, mode, fn) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      let tx;
      try {
        tx = db.transaction(store2, mode);
      } catch (error) {
        dbPromise = void 0;
        reject(error);
        return;
      }
      let result;
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(tx.error || new Error("Browser storage could not finish this change. Check available browser storage and try again."));
      try {
        const req = fn(tx.objectStore(store2));
        req.onsuccess = () => {
          result = req.result;
        };
      } catch (error) {
        tx.abort();
        reject(error);
      }
    });
  }
  const store = {
    datasets: () => operation("datasets", "readonly", (s) => s.getAll()),
    dataset: (id) => operation("datasets", "readonly", (s) => s.get(id)),
    putDataset: (d) => operation("datasets", "readwrite", (s) => s.put(d)),
    deleteDataset: (id) => operation("datasets", "readwrite", (s) => s.delete(id)),
    strategies: () => operation("strategies", "readonly", (s) => s.getAll()),
    putStrategy: (s) => operation("strategies", "readwrite", (store2) => store2.put(s)),
    deleteStrategy: (id) => operation("strategies", "readwrite", (s) => s.delete(id)),
    runs: () => operation("runs", "readonly", (s) => s.getAll()),
    putRun: (r) => operation("runs", "readwrite", (s) => s.put(r)),
    deleteRun: (id) => operation("runs", "readwrite", (s) => s.delete(id)),
    clearRuns: () => operation("runs", "readwrite", (s) => s.clear())
  };
  return store;
}
export {
  createLocalStore
};
