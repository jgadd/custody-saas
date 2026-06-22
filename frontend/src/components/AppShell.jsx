import { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import useAuthStore from '../store/authStore';
import { performFullSync, pullFromServer } from '../lib/sync';
import { getPendingSync } from '../lib/db';

export default function AppShell() {
  const { user, logout, isSuperAdmin, isAdmin } = useAuthStore();
  const navigate = useNavigate();
  const [online, setOnline] = useState(navigator.onLine);
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const handleOnline = async () => {
      setOnline(true);
      setSyncing(true);
      await performFullSync();
      setSyncing(false);
      const p = await getPendingSync();
      setPending(p.length);
    };
    const handleOffline = () => setOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial pull
    if (navigator.onLine) {
      pullFromServer().then(() => {
        getPendingSync().then(p => setPending(p.length));
      });
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleLogout = () => { logout(); navigate('/login'); };

  const navItems = [
    { to: '/', icon: '📊', label: 'Dashboard', exact: true },
    { to: '/detainees', icon: '👤', label: 'Custody Register' },
    { to: '/cells', icon: '🏠', label: 'Cell Management' },
    { to: '/reports', icon: '📋', label: 'Reports' },
  ];

  const adminItems = [
    { to: '/settings', icon: '⚙️', label: 'Station Settings' },
  ];

  const superAdminItems = [
    { to: '/admin', icon: <img src="/rpngc-crest.png" alt="" style={{ width: 16, height: 16, objectFit: 'contain' }} />, label: 'Super Dashboard' },
    { to: '/admin/stations', icon: '🏢', label: 'Manage Stations' },
    { to: '/admin/users', icon: '👥', label: 'All Users' },
    { to: '/admin/plans', icon: '💳', label: 'Plans' },
  ];

  return (
    <div className="app-shell">
      {sidebarOpen && (
        <div onClick={() => setSidebarOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 99, background: 'rgba(0,0,0,0.5)' }} />
      )}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-logo">
          <img src="/rpngc-crest.png" alt="RPNGC" onError={e => e.target.style.display='none'} />
          <div className="sidebar-logo-text">
            <div className="title">RPNGC Custody</div>
            <div className="sub">Management System</div>
          </div>
        </div>
        {user?.station && (
          <div className="sidebar-station">
            <div className="label">Station</div>
            <div className="value">{user.station.name}</div>
          </div>
        )}
        {user?.role === 'SUPER_ADMIN' && (
          <div className="sidebar-station">
            <div className="label">Role</div>
            <div className="value" style={{color: 'var(--purple)'}}>Super Administrator</div>
          </div>
        )}
        <nav className="sidebar-nav">
          <div className="nav-section">
            <div className="nav-label">Custody</div>
            {navItems.map(item => (
              <NavLink key={item.to} to={item.to} end={item.exact}
                className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                onClick={() => setSidebarOpen(false)}>
                <span className="icon">{item.icon}</span>
                {item.label}
                {item.label === 'Custody Register' && pending > 0 && (
                  <span className="nav-badge">{pending}</span>
                )}
              </NavLink>
            ))}
          </div>
          {isAdmin() && (
            <div className="nav-section">
              <div className="nav-label">Administration</div>
              {adminItems.map(item => (
                <NavLink key={item.to} to={item.to}
                  className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                  onClick={() => setSidebarOpen(false)}>
                  <span className="icon">{item.icon}</span>
                  {item.label}
                </NavLink>
              ))}
            </div>
          )}
          {isSuperAdmin() && (
            <div className="nav-section">
              <div className="nav-label">Super Admin</div>
              {superAdminItems.map(item => (
                <NavLink key={item.to} to={item.to}
                  className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                  onClick={() => setSidebarOpen(false)}>
                  <span className="icon">{item.icon}</span>
                  {item.label}
                </NavLink>
              ))}
            </div>
          )}
        </nav>
        <div className="sidebar-footer">
          <div style={{ marginBottom: '0.5rem' }}>
            <div style={{ fontWeight: 600, color: 'var(--text)' }}>{user?.name}</div>
            <div style={{ fontSize: '0.7rem' }}>{user?.rank} · {user?.badgeNumber}</div>
          </div>
          <button className="btn btn-ghost btn-sm" style={{ width: '100%' }} onClick={handleLogout}>
            🚪 Sign Out
          </button>
        </div>
      </aside>

      <div className="main-content">
        {!online && (
          <div className="offline-banner">
            ⚠️ You are offline. Changes will be saved locally and synced when you reconnect.
            {pending > 0 && ` (${pending} record${pending > 1 ? 's' : ''} pending sync)`}
          </div>
        )}
        <header className="topbar">
          <button className="hamburger" onClick={() => setSidebarOpen(!sidebarOpen)}>☰</button>
          <div className="topbar-title" />
          <div className="topbar-right">
            {syncing && <span style={{ fontSize: '0.75rem', color: 'var(--amber)' }}>🔄 Syncing...</span>}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <div className={online ? 'online-dot' : 'offline-dot'} />
              <span className="status-text">{online ? 'Online' : 'Offline'}</span>
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              {new Date().toLocaleDateString('en-PG', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
            </div>
          </div>
        </header>
        <main className="page-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
