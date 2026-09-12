import { useState, useEffect } from 'react';
import api from '../lib/api';
import useAuthStore from '../store/authStore';

export default function SettingsPage() {
  const { user } = useAuthStore();
  const [station, setStation] = useState(null);
  const [stationLoading, setStationLoading] = useState(true);
  const [users, setUsers] = useState([]);
  const [tab, setTab] = useState('users');
  const [showAddUser, setShowAddUser] = useState(false);
  const [userForm, setUserForm] = useState({ name: '', role: 'OFFICER', badgeNumber: '', rank: '' });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const isAdmin = user?.role === 'STATION_ADMIN' || user?.role === 'SUPER_ADMIN';

  useEffect(() => {
    if (!isSuperAdmin) {
      api.get('/stations/me')
        .then(r => setStation(r.data))
        .catch(() => setStation(null))
        .finally(() => setStationLoading(false));
    } else {
      setStationLoading(false);
    }

    if (isAdmin) {
      api.get('/stations/me/users')
        .then(r => setUsers(r.data))
        .catch(() => setUsers([]));
    }
  }, [user]);

  const handleAddUser = async () => {
    if (!userForm.name?.trim()) { setError('Full name is required'); return; }
    setSaving(true); setError(''); setMsg('');
    try {
      const res = await api.post('/stations/me/users', userForm);
      setUsers(u => [...u, res.data]);
      const generated = res.data.generatedUsername || res.data.username;
      const firstName = userForm.name.split(' ')[0] || 'the user';
      setMsg('User created! Username: ' + generated + ' — Tell ' + firstName + ' to log in with this username. They will set their own password on first login.');
      setShowAddUser(false);
      setUserForm({ name: '', role: 'OFFICER', badgeNumber: '', rank: '' });
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to create user');
    } finally {
            </button>
      setSaving(false);
    }
  };

  if (stationLoading) return (
    <div style={{ padding: '2rem', color: 'var(--text-muted)' }}>Loading...</div>
  );

  return (
    <div>
      <h1 style={{ marginBottom: '1.5rem' }}>
        {isSuperAdmin ? 'System Settings' : 'Station Settings'}
      </h1>

      <div className="tabs" style={{ marginBottom: '1.5rem' }}>
        <button className={`tab ${tab==='users'?'active':''}`} onClick={() => setTab('users')}>
          👥 Users
        </button>
        {!isSuperAdmin && (
          <>
            <button className={`tab ${tab==='station'?'active':''}`} onClick={() => setTab('station')}>
              🏢 Station
            <button className={`tab ${tab==='subscription'?'active':''}`} onClick={() => setTab('subscription')}>
              💳 Subscription
            </button>
          </>
        )}
      </div>

      {/* ── USERS TAB ─────────────────────────────────────────── */}
      {tab === 'users' && (
        <div className="card">
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ margin: 0 }}>
              {isSuperAdmin ? 'Super Admin Account' : 'Station Users'}
            </h2>
            {isAdmin && !isSuperAdmin && (
              <button className="btn btn-primary btn-sm" onClick={() => { setShowAddUser(true); setError(''); setMsg(''); }}>
                <i className="ti ti-plus" /> Add User
              </button>
            )}
          </div>

          {msg && (
            <div className="alert alert-success" style={{ marginBottom: '1rem', fontSize: '0.9rem' }}>
              <i className="ti ti-check" /> {msg}
            </div>
          )}

          {isSuperAdmin ? (
            <div className="alert alert-info">
              <i className="ti ti-info-circle" /> You are logged in as <strong>Super Admin</strong>.
              Station user management is done per-station by each Station Admin.
              To manage all users across stations, use <strong>Super Admin → All Users</strong>.
            </div>
          ) : (
            <>
              {users.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                  <i className="ti ti-users" style={{ fontSize: '2rem', display: 'block', marginBottom: '0.5rem' }} />
                  No users found for this station.
                </div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Username</th>
                        <th>Badge</th>
                        <th>Rank</th>
                        <th>Role</th>
                        <th>Last Login</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map(u => (
                        <tr key={u.id}>
                          <td><strong>{u.name}</strong></td>
                          <td style={{ fontFamily: 'monospace', fontSize: '0.85rem', color: 'var(--navy)' }}>{u.username || '—'}</td>
                          <td>{u.badgeNumber || '—'}</td>
                          <td>{u.rank || '—'}</td>
                          <td><span className="badge badge-blue">{u.role.replace(/_/g, ' ')}</span></td>
                          <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            {u.lastLogin ? new Date(u.lastLogin).toLocaleDateString() : 'Never'}
                          </td>
                          <td>
                            <span className={`badge ${u.isActive ? 'badge-green' : 'badge-red'}`}>
                              {u.isActive ? 'Active' : 'Inactive'}
                            </span>
                          </td>
              ['Plan', station.plan?.name],
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── STATION TAB ───────────────────────────────────────── */}
      {tab === 'station' && !isSuperAdmin && station && (
        <div className="card">
          <h2 style={{ marginBottom: '1.5rem' }}>{station.name}</h2>
          <div className="detail-grid">
            {[
              ['Station Code', station.code],
              ['Province', station.province],
              ['District', station.district || '—'],
              ['Address', station.address || '—'],
              ['Phone', station.phone || '—'],
              ['Email', station.email || '—'],
              ['Status', station.subscriptionStatus],
              ['Users', `${station._count?.users || 0} users`],
        </div>
              ['Detainees', `${station._count?.detainees || 0} total`],
            ].map(([l, v]) => (
              <div key={l} className="detail-item">
                <div className="label">{l}</div>
                <div className="value">{v}</div>
              </div>
            ))}
          </div>
          <div className="alert alert-info" style={{ marginTop: '1.5rem' }}>
            <i className="ti ti-info-circle" /> Residential suburb options for booking forms are
            managed nationally under Super Admin → PNG Geography, organised by province and district.
          </div>
      )}

      {/* ── SUBSCRIPTION TAB ──────────────────────────────────── */}
      {tab === 'subscription' && !isSuperAdmin && station && (
        <div className="card">
          <h2 style={{ marginBottom: '1.5rem' }}>Subscription Details</h2>
          <div style={{ padding: '1.5rem', background: 'var(--input-bg)', borderRadius: '8px', marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800 }}>{station.plan?.name} Plan</div>
                <div style={{ color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                  PGK {station.plan?.monthlyPrice}/month
                </div>
              </div>
              <span className={`sub-badge sub-${station.subscriptionStatus}`}>
                {station.subscriptionStatus}
              </span>
            </div>
          </div>
          <div className="detail-grid">
            {[
              ['Max Users', station.plan?.maxUsers],
              ['Max Detainees/Month', station.plan?.maxDetainees?.toLocaleString()],
              ['Billed Until', station.billedUntil ? new Date(station.billedUntil).toLocaleDateString() : '—'],
              ['Trial Ends', station.trialEndsAt ? new Date(station.trialEndsAt).toLocaleDateString() : '—'],
            ].map(([l, v]) => (
              <div key={l} className="detail-item">
                <div className="label">{l}</div>
                <div className="value">{v}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: '1.5rem' }}>
            <div className="stat-label" style={{ marginBottom: '0.5rem' }}>Features Included</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {(station.plan?.features || []).map(f => (
                <span key={f} className="badge badge-green">✓ {f.replace(/_/g, ' ')}</span>
              ))}
            </div>
          </div>
          <div className="alert alert-info" style={{ marginTop: '1.5rem' }}>
            💳 To upgrade your plan or manage billing, contact your RPNGC ICT administrator.
          </div>
        </div>
      )}

      {/* ── ADD USER MODAL ────────────────────────────────────── */}
      {showAddUser && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowAddUser(false)}>
          <div className="modal" style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <h2>Add New User</h2>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowAddUser(false)}>
                <i className="ti ti-x" />
              </button>
            </div>
            <div className="modal-body">
              {error && (
                <div className="alert alert-error" style={{ marginBottom: '1rem' }}>
                  <i className="ti ti-alert-triangle" /> {error}
                </div>
              )}
              <div className="form-row">
                <div className="form-group">
                  <label>Full Name *</label>
                  <input
                    value={userForm.name}
                    onChange={e => setUserForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. Joshua Gadd"
                    autoFocus
                  />
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                    Username will be auto-generated (e.g. jgadd)
                  </div>
                </div>
                <div className="form-group">
                  <label>Badge Number</label>
                  <input
                    value={userForm.badgeNumber}
                    onChange={e => setUserForm(f => ({ ...f, badgeNumber: e.target.value }))}
                    placeholder="e.g. BKO-042"
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Rank</label>
                  <input
                    value={userForm.rank}
                    onChange={e => setUserForm(f => ({ ...f, rank: e.target.value }))}
                    placeholder="Constable, Sergeant..."
              <button className="btn btn-ghost" onClick={() => setShowAddUser(false)}>Cancel</button>
                  />
                </div>
                <div className="form-group">
                  <label>Role</label>
                  <select value={userForm.role} onChange={e => setUserForm(f => ({ ...f, role: e.target.value }))}>
                    <option value="OFFICER">Officer</option>
                    <option value="DUTY_SERGEANT">Duty Sergeant</option>
                    <option value="STATION_ADMIN">Station Admin</option>
                  </select>
                </div>
              </div>
              <div className="alert alert-info" style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>
                <i className="ti ti-info-circle" /> A temporary password is set automatically.
                The user will be prompted to choose their own password on first login.
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-primary" onClick={handleAddUser} disabled={saving}>
                {saving
                  ? <><i className="ti ti-loader-2" /> Creating…</>
                  : <><i className="ti ti-user-plus" /> Create User</>
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
