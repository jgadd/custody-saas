import { useState, useEffect } from 'react';
import api from '../lib/api';

export default function CellsPage() {
  const [cells, setCells] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ cellNumber: '', type: 'GENERAL', capacity: 6 });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/cells').then(r => setCells(r.data)).finally(() => setLoading(false));
  }, []);

  const handleAdd = async () => {
    setSaving(true);
    try {
      const res = await api.post('/cells', form);
      setCells(c => [...c, res.data]);
      setShowAdd(false);
      setForm({ cellNumber: '', type: 'GENERAL', capacity: 6 });
    } finally { setSaving(false); }
  };

  const cellTypeColor = { GENERAL: 'badge-blue', FEMALE: 'badge-purple', JUVENILE: 'badge-amber', HIGH_SECURITY: 'badge-red', MEDICAL: 'badge-green' };

  if (loading) return <div style={{ color: 'var(--text-muted)' }}>Loading cells...</div>;

  const totalCap = cells.reduce((a, c) => a + c.capacity, 0);
  const totalOcc = cells.reduce((a, c) => a + (c._count?.detainees || 0), 0);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h1>Cell Management</h1>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}>+ Add Cell</button>
      </div>

      <div className="stat-grid" style={{ marginBottom: '1.5rem' }}>
        <div className="stat-card red"><div className="stat-label">Occupied</div><div className="stat-value" style={{ color: 'var(--red)' }}>{totalOcc}</div><div className="stat-sub">of {totalCap} capacity</div></div>
        <div className="stat-card green"><div className="stat-label">Available</div><div className="stat-value" style={{ color: 'var(--green)' }}>{totalCap - totalOcc}</div><div className="stat-sub">spaces remaining</div></div>
        <div className="stat-card"><div className="stat-label">Occupancy</div><div className="stat-value">{totalCap ? Math.round(totalOcc/totalCap*100) : 0}%</div></div>
      </div>

      <div className="card">
        <h2 style={{ marginBottom: '1.25rem' }}>Cell Overview</h2>
        {cells.length === 0 ? (
          <div className="table-empty"><div>🏠</div><p>No cells configured yet</p></div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px,1fr))', gap: '1rem' }}>
            {cells.map(c => {
              const occ = c._count?.detainees || 0;
              const pct = Math.round(occ / c.capacity * 100);
              const color = pct >= 100 ? 'var(--red)' : pct >= 75 ? 'var(--amber)' : 'var(--green)';
              return (
                <div key={c.id} className="card" style={{ borderLeft: `4px solid ${color}`, padding: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ fontSize: '2rem', fontWeight: 800 }}>{c.cellNumber}</div>
                    <span className={`badge ${cellTypeColor[c.type]}`}>{c.type.replace('_',' ')}</span>
                  </div>
                  <div style={{ marginTop: '0.75rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '0.25rem' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Occupancy</span>
                      <span style={{ color, fontWeight: 700 }}>{occ}/{c.capacity}</span>
                    </div>
                    <div style={{ background: 'var(--border)', borderRadius: '4px', height: '6px', overflow: 'hidden' }}>
                      <div style={{ background: color, width: `${Math.min(pct, 100)}%`, height: '100%', borderRadius: '4px', transition: 'width 0.3s' }} />
                    </div>
                  </div>
                  {pct >= 100 && <div style={{ color: 'var(--red)', fontSize: '0.75rem', marginTop: '0.5rem', fontWeight: 700 }}>⚠ AT CAPACITY</div>}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showAdd && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 440 }}>
            <div className="modal-header"><h2>Add Cell</h2><button className="btn btn-ghost btn-icon" onClick={() => setShowAdd(false)}>✕</button></div>
            <div className="modal-body">
              <div className="form-group"><label>Cell Number / ID *</label><input value={form.cellNumber} onChange={e => setForm(f => ({ ...f, cellNumber: e.target.value }))} placeholder="e.g. C3, F2" /></div>
              <div className="form-group"><label>Type</label>
                <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                  <option value="GENERAL">General</option><option value="FEMALE">Female</option>
                  <option value="JUVENILE">Juvenile</option><option value="HIGH_SECURITY">High Security</option><option value="MEDICAL">Medical</option>
                </select>
              </div>
              <div className="form-group"><label>Capacity</label><input type="number" min="1" max="50" value={form.capacity} onChange={e => setForm(f => ({ ...f, capacity: parseInt(e.target.value) }))} /></div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowAdd(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleAdd} disabled={saving || !form.cellNumber}>{saving ? 'Saving...' : 'Add Cell'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
