import { openDB } from 'idb';

const DB_NAME = 'custody_offline';
const DB_VERSION = 1;

export async function getDB() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('detainees')) {
        const store = db.createObjectStore('detainees', { keyPath: 'id' });
        store.createIndex('stationId', 'stationId');
        store.createIndex('status', 'status');
      }
      if (!db.objectStoreNames.contains('cells')) {
        db.createObjectStore('cells', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('pendingSync')) {
        db.createObjectStore('pendingSync', { keyPath: 'clientId' });
      }
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'key' });
      }
    }
  });
}

export async function saveDetainee(detainee) {
  const db = await getDB();
  await db.put('detainees', { ...detainee, _syncStatus: 'synced' });
}

export async function saveDetaineeOffline(detainee) {
  const db = await getDB();
  const record = { ...detainee, _syncStatus: 'pending', _offlineCreatedAt: new Date().toISOString() };
  await db.put('detainees', record);
  await db.put('pendingSync', { clientId: detainee.id, type: 'detainee', data: detainee, updatedAt: new Date().toISOString() });
  return record;
}

export async function getAllDetainees(stationId) {
  const db = await getDB();
  const all = await db.getAll('detainees');
  return stationId ? all.filter(d => d.stationId === stationId) : all;
}

export async function getPendingSync() {
  const db = await getDB();
  return db.getAll('pendingSync');
}

export async function clearPendingSync(clientId) {
  const db = await getDB();
  await db.delete('pendingSync', clientId);
}

export async function getLastSync() {
  const db = await getDB();
  const meta = await db.get('meta', 'lastSync');
  return meta?.value;
}

export async function setLastSync(date) {
  const db = await getDB();
  await db.put('meta', { key: 'lastSync', value: date });
}

export async function saveCells(cells) {
  const db = await getDB();
  const tx = db.transaction('cells', 'readwrite');
  await Promise.all(cells.map(c => tx.store.put(c)));
  await tx.done;
}

export async function getCells() {
  const db = await getDB();
  return db.getAll('cells');
}
