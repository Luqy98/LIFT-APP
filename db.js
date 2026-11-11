// Thin IndexedDB wrapper. Two stores:
//   vault   -> the wrapped data key + lockout counters (no personal data)
//   records -> encrypted records: 'meta' (plans, exercises, settings) and 'session:<id>' (one per workout log)

export async function openDb(name = 'gymlog') {
  const db = await new Promise((resolve, reject) => {
    const r = indexedDB.open(name, 1);
    r.onupgradeneeded = () => {
      r.result.createObjectStore('records');
      r.result.createObjectStore('vault');
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.onblocked = () => reject(new Error('Storage is blocked by another tab.'));
  });

  const req = (r) => new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  const done = (tx) => new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Storage write aborted'));
  });

  return {
    get: (store, key) => req(db.transaction(store).objectStore(store).get(key)),
    async all(store) {
      const os = db.transaction(store).objectStore(store);
      const [keys, vals] = await Promise.all([req(os.getAllKeys()), req(os.getAll())]);
      return keys.map((k, i) => [k, vals[i]]);
    },
    async batch(store, put = [], del = []) {
      const tx = db.transaction(store, 'readwrite');
      const os = tx.objectStore(store);
      for (const [k, v] of put) os.put(v, k);
      for (const k of del) os.delete(k);
      await done(tx);
    },
    async clearAll() {
      const tx = db.transaction(['records', 'vault'], 'readwrite');
      tx.objectStore('records').clear();
      tx.objectStore('vault').clear();
      await done(tx);
    },
  };
}

/** In-memory stand-in with the same interface (used by tests). */
export function memoryDb() {
  const stores = { records: new Map(), vault: new Map() };
  return {
    stores,
    async get(store, key) { return stores[store].get(key); },
    async all(store) { return [...stores[store].entries()]; },
    async batch(store, put = [], del = []) {
      for (const [k, v] of put) stores[store].set(k, v);
      for (const k of del) stores[store].delete(k);
    },
    async clearAll() { stores.records.clear(); stores.vault.clear(); },
  };
}
