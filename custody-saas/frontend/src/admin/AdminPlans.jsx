import { useState, useEffect } from 'react';
import api from '../lib/api';

export default function AdminPlans() {
  const [plans, setPlans] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: '', maxUsers: 10, maxDetainees: 1000, monthlyPrice: 0, features: ['custody_register', 'reports'] });
  const [saving, setSaving] = useState(false);
  const ALL_FEATURES = ['custody_register', 'reports', 'audit_log', 'cell_management', 'welfare_checks', 'api_access', 'multi_station', 'analytics'];

  useEffect(() => { api.get('/plans').then(r => setPlans(r.data)); }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await api.post('/plans', form);
      setPlans(p => [...p, res.data]);
      setShowAdd(false);
    } finally { setSaving(false); }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h1>💳 Subscription Plans</h1>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}>+ New Plan</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px,1fr))', gap: '1.5rem' }}>
        {plans.map(p => (
          <div key={p.id} className="card" style={{ borderTop: '4px solid var(--gold)' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '0.25rem' }}>{p.name}</div>
            <div style={{ fontSize: '2rem', fontWeight: 900, color: 'var(--gold)', marginBottom: '0.75rem' }}>
              PGK {Number(p.monthlyPrice).toLocaleString()}<span style={{ fontSize: '1rem', fontWeight: 400, color: 'var(--text-muted)' }}>/mo</span>
            </div>
            <div className="detail-grid" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: '1rem' }}>
              <div className="detail-item"><div className="label">Max Users</div><div className="value">{p.maxUsers}</div></div>
              <div className="detail-item"><div className="label">Detainees/mo</div><div className="value">{p.maxDetainees?.toLocaleString()}</div></div>
            </div>
            <div>
              <div className="stat-label" style={{ marginBottom: '0.5rem' }}>Features</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                {(p.features || []).map(f => <span key={f} className="badge badge-green" style={{ fontSize: '0.65rem' }}>✓ {f.replace(/_/g,' ')}</span>)}
              </div>
            </div>
          </div>
        ))}
      </div>

      {showAdd && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 480 }}>
            <div className="modal-header"><h2>New Plan</h2><button className="btn btn-ghost btn-icon" onClick={() => setShowAdd(false)}>✕</button></div>
            <div className="modal-body">
              <div className="form-group"><label>Plan Name</label><input value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} placeholder="Basic, Standard, Premium..." /></div>
              <div className="form-row">
                <div className="form-group"><label>Max Users</label><input type="number" value={form.maxUsers} onChange={e => setForm(f => ({...f, maxUsers: parseInt(e.target.value)}))} /></div>
                <div className="form-group"><label>Max Detainees</label><input type="number" value={form.maxDetainees} onChange={e => setForm(f => ({...f, maxDetainees: parseInt(e.target.value)}))} /></div>
              </div>
              <div className="form-group"><label>Monthly Price (PGK)</label><input type="number" value={form.monthlyPrice} onChange={e => setForm(f => ({...f, monthlyPrice: parseFloat(e.target.value)}))} /></div>
              <div className="form-group">
                <label>Features</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.5rem' }}>
                  {ALL_FEATURES.map(feat => (
                    <button key={feat} type="button" className={`btn btn-sm ${form.features.includes(feat) ? 'btn-primary' : 'btn-ghost'}`}
                      onClick={() => setForm(f => ({ ...f, features: f.features.includes(feat) ? f.features.filter(x => x !== feat) : [...f.features, feat] }))}>
                      {feat.replace(/_/g,' ')}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowAdd(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Create Plan'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
