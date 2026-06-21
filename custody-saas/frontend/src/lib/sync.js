import api from './api';
import { getPendingSync, clearPendingSync, getAllDetainees, saveDetainee, saveCells, getLastSync, setLastSync } from './db';

export async function syncToServer() {
  const pending = await getPendingSync();
  const results = [];
  if (pending.length > 0) {
    try {
      const res = await api.post('/sync/push', { records: pending });
      for (const result of res.data.results) {
        if (result.action !== 'error') {
          await clearPendingSync(result.clientId);
          results.push(result);
        }
      }
    } catch (e) {
      console.warn('Sync push failed:', e.message);
    }
  }
  return results;
}

export async function pullFromServer() {
  try {
    const since = await getLastSync();
    const res = await api.get('/sync/pull', { params: { since } });
    const { detainees, cells, serverTime } = res.data;
    for (const d of detainees) await saveDetainee(d);
    if (cells?.length) await saveCells(cells);
    await setLastSync(serverTime);
    return { detainees: detainees.length, cells: cells?.length || 0 };
  } catch (e) {
    console.warn('Sync pull failed:', e.message);
    return null;
  }
}

export async function performFullSync() {
  const pushed = await syncToServer();
  const pulled = await pullFromServer();
  return { pushed, pulled };
}
