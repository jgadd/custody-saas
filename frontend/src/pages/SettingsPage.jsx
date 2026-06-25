import { useState, useEffect } from 'react';
import api from '../lib/api';
import useAuthStore from '../store/authStore';

export default function SettingsPage() {
  const { user } = useAuthStore();
  const [station, setStation] = useState(null);
  const [users, setUsers] = useState([]);
  const [tab, setTab] = useState('station');
  const [showAddUser, setShowAddUser] = useState(false);
  const [userForm, setUserForm] = useState({ name: '', email: '', password: '', role: 'OFFICER', badgeNumber: '', rank: '' });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [suburbInput, setSuburbInput] = useState('');
  const [suburbList, setSuburbList] = useState([]);
  const [savingSuburbs, setSavingSuburbs] = useState(false);

  useEffect(() => {
    api.get('/stations/me').then(r => { setStation(r.data); setSuburbList(r.data.suburbs || []); });
    if (user?.role === 'STATION_ADMIN' || user?.role === 'SUPER_ADMIN') {
      api.get('/stations/me/users').then(r => setUsers(r.data));
    }
  }, [user]);

  const addSuburb = () => {
    const trimmed = suburbInput.trim();
    if (!trimmed || suburbList.includes(trimmed)) { setSuburbInput(''); return; }
    setSuburbList(list => [...list, trimmed]);
    setSuburbInput('');
  };

  const removeSuburb = (s) => setSuburbList(list => list.filter(x => x !== s));

  const saveSuburbs = async () => {
    setSavingSuburbs(true);
    try {
      await api.put('/stations/me/suburbs', { suburbs: suburbList });
      setMsg('Suburb list updated');
    } catch (e) {
      setMsg(e.response?.data?.error || 'Failed to save suburbs');
    } finally {
      setSavingSuburbs(false);
    }
  };

  const handleAddUser = async () => {
    setSaving(true);
    try {
      const res = await api.post('/stations/me/users', userForm);
      setUsers(u => [...u, res.data]);
      setShowAddUser(false);
      setMsg('User added successfully');
    } catch (e) { setMsg(e.response?.data?.error || 'Failed'); }
    finally { setSaving(false); }
  };

  if (!station) return <div style={{ color: 'var(--text-muted)' }}>Loading...</div>;

  return (
    <div>
      <h1 style={{ marginBottom: '1.5rem' }}>Station Settings</h1>

      <div className="tabs">
        {['station', 'users', 'subscription'].map(t => (
          <button key={t} className={`tab ${tab===t?'active':''}`} onClick={() => setTab(t)}>
            {t === 'station' ? '🏢 Station' : t === 'users' ? '👥 Users' : '💳 Subscription'}
          </button>
        ))}
      </div>

      {tab === 'station' && (
        <div className="card">
          <h2 style={{ marginBottom: '1.5rem' }}>{station.name}</h2>
          <div className="detail-grid">
            {[
              ['Station Code', station.code], ['Province', station.province],
              ['District', station.district || '—'], ['Address', station.address || '—'],
              ['Phone', station.phone || '—'], ['Email', station.email || '—'],
              ['Plan', station.plan?.name], ['Status', station.subscriptionStatus],
              ['Users', `${station._count?.users} users`], ['Detainees', `${station._count?.detainees} total`],
            ].map(([l, v]) => (
              <div key={l} className="detail-item"><div className="label">{l}</div><div className="value">{v}</div></div>
            ))}
          </div>
          {(user?.role === 'STATION_ADMIN' || user?.role === 'SUPER_ADMIN') && (
            <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border)' }}>
              <h3 style={{ marginBottom: '0.5rem' }}>Suburbs Covered</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '0.75rem' }}>
                Used to populate the "Residential Suburb" dropdown on booking forms at this station.
                Suburb names aren't standardized nationally, so add the ones your station's officers actually use.
              </p>
              {msg && <div className="alert alert-success" style={{ marginBottom: '0.75rem' }}>✓ {msg}</div>}
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
                <input
                  value={suburbInput}
                  onChange={e => setSuburbInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSuburb(); } }}
                  placeholder="e.g. Gordons, Hohola, Tokarara"
                  style={{ maxWidth: 280 }}
                />
                <button className="btn btn-ghost" type="button" onClick={addSuburb}>+ Add</button>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
                {suburbList.length === 0 && <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No suburbs added yet.</span>}
                {suburbList.map(s => (
                  <span key={s} className="badge badge-gold" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                    {s}
                    <button
                      type="button"
                      onClick={() => removeSuburb(s)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: '0.9rem', lineHeight: 1, padding: 0 }}
                      aria-label={`Remove ${s}`}
                    >✕</button>
                  </span>
                ))}
              </div>
              <button className="btn btn-primary btn-sm" onClick={saveSuburbs} disabled={savingSuburbs}>
                {savingSuburbs ? 'Saving...' : 'Save Suburb List'}
              </button>
            </div>
          )}
        </div>
      )}

      {tab === 'users' && (
        <div className="card">
          <div className="card-header">
            <h2>Station Users</h2>
            {(user?.role === 'STATION_ADMIN' || user?.role === 'SUPER_ADMIN') && (
              <button className="btn btn-primary btn-sm" onClick={() => setShowAddUser(true)}>+ Add User</button>
            )}
          </div>
          {msg && <div className="alert alert-success" style={{ marginBottom: '1rem' }}>✓ {msg}</div>}
          <div className="table-wrap">
            <table>
              <thead><tr><th>Name</th><th>Badge</th><th>Rank</th><th>Role</th><th>Email</th><th>Last Login</th><th>Status</th></tr></thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id}>
                    <td><strong>{u.name}</strong></td>
                    <td>{u.badgeNumber || '—'}</td>
                    <td>{u.rank || '—'}</td>
                    <td><span className="badge badge-blue">{u.role.replace('_',' ')}</span></td>
                    <td style={{ fontSize: '0.8rem' }}>{u.email}</td>
                    <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{u.lastLogin ? new Date(u.lastLogin).toLocaleDateString() : 'Never'}</td>
                    <td><span className={`badge ${u.isActive ? 'badge-green' : 'badge-red'}`}>{u.isActive ? 'Active' : 'Inactive'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'subscription' && (
        <div className="card">
          <h2 style={{ marginBottom: '1.5rem' }}>Subscription Details</h2>
          <div style={{ padding: '1.5rem', background: 'var(--input-bg)', borderRadius: '8px', marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800 }}>{station.plan?.name} Plan</div>
                <div style={{ color: 'var(--text-muted)', marginTop: '0.25rem' }}>PGK {station.plan?.monthlyPrice}/month</div>
              </div>
              <span className={`sub-badge sub-${station.subscriptionStatus}`}>{station.subscriptionStatus}</span>
            </div>
          </div>
          <div className="detail-grid">
            {[
              ['Max Users', station.plan?.maxUsers],
              ['Max Detainees/Month', station.plan?.maxDetainees?.toLocaleString()],
              ['Billed Until', station.billedUntil ? new Date(station.billedUntil).toLocaleDateString() : '—'],
              ['Trial Ends', station.trialEndsAt ? new Date(station.trialEndsAt).toLocaleDateString() : '—'],
            ].map(([l,v]) => (
              <div key={l} className="detail-item"><div className="label">{l}</div><div className="value">{v}</div></div>
            ))}
          </div>
          <div style={{ marginTop: '1.5rem' }}>
            <div className="stat-label" style={{ marginBottom: '0.5rem' }}>Features Included</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {(station.plan?.features || []).map(f => (
                <span key={f} className="badge badge-green">✓ {f.replace('_',' ')}</span>
              ))}
            </div>
          </div>
          <div className="alert alert-info" style={{ marginTop: '1.5rem' }}>
            💳 To upgrade your plan or manage billing, contact your RPNGC ICT administrator.
          </div>
        </div>
      )}

      {showAddUser && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 480 }}>
            <div className="modal-header"><h2>Add User</h2><button className="btn btn-ghost btn-icon" onClick={() => setShowAddUser(false)}>✕</button></div>
            <div className="modal-body">
              <div className="form-row">
                <div className="form-group"><label>Full Name *</label><input value={userForm.name} onChange={e => setUserForm(f => ({ ...f, name: e.target.value }))} /></div>
                <div className="form-group"><label>Badge Number</label><input value={userForm.badgeNumber} onChange={e => setUserForm(f => ({ ...f, badgeNumber: e.target.value }))} /></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label>Rank</label><input value={userForm.rank} onChange={e => setUserForm(f => ({ ...f, rank: e.target.value }))} placeholder="Constable, Sergeant..." /></div>
                <div className="form-group"><label>Role</label>
                  <select value={userForm.role} onChange={e => setUserForm(f => ({ ...f, role: e.target.value }))}>
                    <option value="OFFICER">Officer</option>
                    <option value="DUTY_SERGEANT">Duty Sergeant</option>
                    <option value="STATION_ADMIN">Station Admin</option>
                  </select>
                </div>
              </div>
              <div className="form-group"><label>Email *</label><input type="email" value={userForm.email} onChange={e => setUserForm(f => ({ ...f, email: e.target.value }))} /></div>
              <div className="form-group"><label>Initial Password *</label><input type="password" value={userForm.password} onChange={e => setUserForm(f => ({ ...f, password: e.target.value }))} /></div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowAddUser(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleAddUser} disabled={saving}>
                {saving ? 'Adding...' : 'Add User'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
