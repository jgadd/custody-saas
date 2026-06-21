import { useState, useEffect } from 'react';
import api from '../lib/api';

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    api.get('/admin/users').then(r => setUsers(r.data)).finally(() => setLoading(false));
  }, []);

  const filtered = users.filter(u =>
    u.name?.toLowerCase().includes(search.toLowerCase()) ||
    u.email?.toLowerCase().includes(search.toLowerCase()) ||
    u.station?.name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <h1 style={{ marginBottom: '1.5rem' }}>👥 All Users</h1>
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="search-bar" style={{ maxWidth: 320 }}>
          <span>🔍</span>
          <input placeholder="Search users..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>
      <div className="card">
        {loading ? <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</div> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Name</th><th>Badge</th><th>Role</th><th>Station</th><th>Email</th><th>Last Login</th><th>Status</th></tr></thead>
              <tbody>
                {filtered.map(u => (
                  <tr key={u.id}>
                    <td><strong>{u.name}</strong><br/><span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{u.rank}</span></td>
                    <td>{u.badgeNumber || '—'}</td>
                    <td><span className={`badge ${u.role === 'SUPER_ADMIN' ? 'badge-purple' : u.role === 'STATION_ADMIN' ? 'badge-gold' : 'badge-blue'}`}>{u.role.replace(/_/g,' ')}</span></td>
                    <td>{u.station?.name || <span style={{ color: 'var(--text-muted)' }}>HQ</span>}</td>
                    <td style={{ fontSize: '0.8rem' }}>{u.email}</td>
                    <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{u.lastLogin ? new Date(u.lastLogin).toLocaleDateString() : 'Never'}</td>
                    <td><span className={`badge ${u.isActive ? 'badge-green' : 'badge-red'}`}>{u.isActive ? 'Active' : 'Inactive'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
