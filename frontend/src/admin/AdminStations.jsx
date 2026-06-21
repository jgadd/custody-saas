import { useState, useEffect } from 'react';
import api from '../lib/api';

export default function AdminStations() {
  const [stations, setStations] = useState([]);
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editSub, setEditSub] = useState(null);
  const [form, setForm] = useState({
    name: '', code: '', province: '', district: '', address: '', planId: '',
    adminUser: { name: '', email: '', password: '', badgeNumber: '' }
  });
  const [subForm, setSubForm] = useState({ subscriptionStatus: '', planId: '', billedUntil: '' });
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    Promise.all([api.get('/admin/stations'), api.get('/plans')])
      .then(([s, p]) => { setStations(s.data); setPlans(p.data); if (p.data[0]) setForm(f => ({...f, planId: p.data[0].id})); })
      .finally(() => setLoading(false));
  }, []);

  const handleAdd = async () => {
    setSaving(true);
    try {
      const res = await api.post('/admin/stations', form);
      setStations(s => [res.data, ...s]);
      setShowAdd(false);
    } finally { setSaving(false); }
  };

  const handleSubUpdate = async () => {
    setSaving(true);
    try {
      const res = await api.patch(`/admin/stations/${editSub.id}/subscription`, subForm);
      setStations(s => s.map(x => x.id === editSub.id ? { ...x, ...res.data } : x));
      setEditSub(null);
    } finally { setSaving(false); }
  };

  const filtered = stations.filter(s => 
    s.name.toLowerCase().includes(search.toLowerCase()) || s.code.toLowerCase().includes(search.toLowerCase())
  );

  const provinces = ['NCD', 'Central', 'Morobe', 'Eastern Highlands', 'Western Highlands', 'Southern Highlands', 'Enga', 'Chimbu', 'Gulf', 'Western', 'Milne Bay', 'Oro', 'Manus', 'New Ireland', 'East New Britain', 'West New Britain', 'Bougainville', 'East Sepik', 'West Sepik', 'Madang', 'Jiwaka', 'Hela'];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h1>🏢 Police Stations</h1>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}>+ Add Station</button>
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="search-bar" style={{ maxWidth: 320 }}>
          <span>🔍</span>
          <input placeholder="Search stations..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="card">
        {loading ? <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</div> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Station</th><th>Code</th><th>Province</th><th>Plan</th><th>Status</th><th>Users</th><th>Detainees</th><th>Billed Until</th><th>Actions</th></tr></thead>
              <tbody>
                {filtered.map(s => (
                  <tr key={s.id}>
                    <td><strong>{s.name}</strong></td>
                    <td><span className="badge badge-blue">{s.code}</span></td>
                    <td>{s.province}</td>
                    <td>{s.plan?.name}</td>
                    <td><span className={`sub-badge sub-${s.subscriptionStatus}`}>{s.subscriptionStatus}</span></td>
                    <td>{s._count?.users}</td>
                    <td>{s._count?.detainees}</td>
                    <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{s.billedUntil ? new Date(s.billedUntil).toLocaleDateString() : s.trialEndsAt ? `Trial: ${new Date(s.trialEndsAt).toLocaleDateString()}` : '—'}</td>
                    <td>
                      <button className="btn btn-ghost btn-sm" onClick={() => { setEditSub(s); setSubForm({ subscriptionStatus: s.subscriptionStatus, planId: s.planId, billedUntil: '' }); }}>
                        ✏️ Subscription
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showAdd && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header"><h2>Add New Station</h2><button className="btn btn-ghost btn-icon" onClick={() => setShowAdd(false)}>✕</button></div>
            <div className="modal-body" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
              <h3 style={{ marginBottom: '1rem', color: 'var(--gold)' }}>Station Details</h3>
              <div className="form-row">
                <div className="form-group"><label>Station Name *</label><input value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} placeholder="e.g. Boroko Police Station" /></div>
                <div className="form-group"><label>Station Code *</label><input value={form.code} onChange={e => setForm(f => ({...f, code: e.target.value.toUpperCase()}))} placeholder="e.g. BKO" maxLength={6} /></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label>Province *</label>
                  <select value={form.province} onChange={e => setForm(f => ({...f, province: e.target.value}))}>
                    <option value="">Select province...</option>
                    {provinces.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div className="form-group"><label>District</label><input value={form.district} onChange={e => setForm(f => ({...f, district: e.target.value}))} /></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label>Address</label><input value={form.address} onChange={e => setForm(f => ({...f, address: e.target.value}))} /></div>
                <div className="form-group"><label>Subscription Plan *</label>
                  <select value={form.planId} onChange={e => setForm(f => ({...f, planId: e.target.value}))}>
                    {plans.map(p => <option key={p.id} value={p.id}>{p.name} — PGK {p.monthlyPrice}/mo</option>)}
                  </select>
                </div>
              </div>
              <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '1rem 0' }} />
              <h3 style={{ marginBottom: '1rem', color: 'var(--gold)' }}>Station Admin Account</h3>
              <div className="form-row">
                <div className="form-group"><label>Admin Name</label><input value={form.adminUser.name} onChange={e => setForm(f => ({...f, adminUser: {...f.adminUser, name: e.target.value}}))} /></div>
                <div className="form-group"><label>Badge #</label><input value={form.adminUser.badgeNumber} onChange={e => setForm(f => ({...f, adminUser: {...f.adminUser, badgeNumber: e.target.value}}))} /></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label>Admin Email</label><input type="email" value={form.adminUser.email} onChange={e => setForm(f => ({...f, adminUser: {...f.adminUser, email: e.target.value}}))} /></div>
                <div className="form-group"><label>Password</label><input type="password" value={form.adminUser.password} onChange={e => setForm(f => ({...f, adminUser: {...f.adminUser, password: e.target.value}}))} /></div>
              </div>
              <div className="alert alert-info">Stations start with a 30-day free trial automatically.</div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowAdd(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleAdd} disabled={saving}>{saving ? 'Creating...' : '+ Create Station'}</button>
            </div>
          </div>
        </div>
      )}

      {editSub && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 440 }}>
            <div className="modal-header"><h2>Manage Subscription</h2><button className="btn btn-ghost btn-icon" onClick={() => setEditSub(null)}>✕</button></div>
            <div className="modal-body">
              <p style={{ marginBottom: '1rem' }}><strong>{editSub.name}</strong></p>
              <div className="form-group"><label>Status</label>
                <select value={subForm.subscriptionStatus} onChange={e => setSubForm(f => ({...f, subscriptionStatus: e.target.value}))}>
                  <option value="TRIAL">Trial</option><option value="ACTIVE">Active</option>
                  <option value="PAST_DUE">Past Due</option><option value="SUSPENDED">Suspended</option><option value="CANCELLED">Cancelled</option>
                </select>
              </div>
              <div className="form-group"><label>Plan</label>
                <select value={subForm.planId} onChange={e => setSubForm(f => ({...f, planId: e.target.value}))}>
                  {plans.map(p => <option key={p.id} value={p.id}>{p.name} — PGK {p.monthlyPrice}/mo</option>)}
                </select>
              </div>
              <div className="form-group"><label>Billed Until</label><input type="date" value={subForm.billedUntil} onChange={e => setSubForm(f => ({...f, billedUntil: e.target.value}))} /></div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setEditSub(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSubUpdate} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
