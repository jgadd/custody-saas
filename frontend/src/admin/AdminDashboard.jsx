import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);

  useEffect(() => { api.get('/admin/stats').then(r => setStats(r.data)); }, []);

  return (
    <div>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ color: 'var(--purple)' }}>🛡️ Super Admin Dashboard</h1>
        <p style={{ color: 'var(--text-muted)' }}>Platform-wide overview — RPNGC Custody Management SaaS</p>
      </div>

      {stats && (
        <div className="stat-grid" style={{ marginBottom: '2rem' }}>
          <div className="stat-card purple">
            <div className="stat-label">Total Stations</div>
            <div className="stat-value" style={{ color: 'var(--purple)' }}>{stats.totalStations}</div>
            <div className="stat-sub">{stats.activeStations} active subscriptions</div>
          </div>
          <div className="stat-card blue">
            <div className="stat-label">Total Users</div>
            <div className="stat-value" style={{ color: 'var(--blue)' }}>{stats.totalUsers}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Total Detainees</div>
            <div className="stat-value">{stats.totalDetainees?.toLocaleString()}</div>
            <div className="stat-sub">across all stations</div>
          </div>
          <div className="stat-card green">
            <div className="stat-label">Monthly Revenue</div>
            <div className="stat-value" style={{ color: 'var(--green)', fontSize: '1.5rem' }}>
              PGK {Number(stats.mrr || 0).toLocaleString()}
            </div>
            <div className="stat-sub">MRR</div>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px,1fr))', gap: '1rem' }}>
        {[
          { to: '/admin/stations', icon: '🏢', title: 'Manage Stations', desc: 'Add, edit, manage station subscriptions' },
          { to: '/admin/users', icon: '👥', title: 'All Users', desc: 'View all officers across stations' },
          { to: '/admin/plans', icon: '💳', title: 'Subscription Plans', desc: 'Configure plan tiers and pricing' },
        ].map(item => (
          <Link key={item.to} to={item.to} className="card" style={{ textDecoration: 'none', display: 'block', borderLeft: '4px solid var(--purple)' }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>{item.icon}</div>
            <div style={{ fontWeight: 700, marginBottom: '0.25rem' }}>{item.title}</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{item.desc}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
