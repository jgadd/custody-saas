import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import useAuthStore from '../store/authStore';
import api from '../lib/api';
import BookingModal from '../components/BookingModal';

export default function DashboardPage() {
  const { user } = useAuthStore();
  const [stats, setStats] = useState(null);
  const [recent, setRecent] = useState([]);
  const [biometricStats, setBiometricStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showBooking, setShowBooking] = useState(false);

  const loadDashboard = () => {
    if (user?.role === 'SUPER_ADMIN') return;
    Promise.all([
      api.get('/detainees/stats'),
      api.get('/detainees?limit=5&status=IN_CUSTODY'),
      api.get('/biometrics/stats').catch(() => ({ data: null })),
    ]).then(([s, r, b]) => {
      setStats(s.data);
      setRecent(r.data.detainees || []);
      setBiometricStats(b.data);
    }).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => {
    loadDashboard();
  }, [user]);

  const handleBooked = () => {
    setShowBooking(false);
    loadDashboard();
  };

  if (user?.role === 'SUPER_ADMIN') {
    return (
      <div>
        <h1 style={{ marginBottom: '1.5rem' }}>Welcome, {user.name}</h1>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
          <Link to="/admin" className="card" style={{ textDecoration: 'none', display: 'block', borderLeft: '4px solid var(--purple)' }}>
            <div className="stat-label">Super Admin Portal</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <img src="/rpngc-crest.png" alt="" style={{ width: 22, height: 22, objectFit: 'contain' }} /> Open Dashboard
            </div>
          </Link>
          <Link to="/admin/stations" className="card" style={{ textDecoration: 'none', display: 'block', borderLeft: '4px solid var(--blue)' }}>
            <div className="stat-label">Police Stations</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, marginTop: '0.5rem' }}>🏢 Manage Stations</div>
          </Link>
        </div>
      </div>
    );
  }

  if (loading) return <div style={{ color: 'var(--text-muted)', padding: '2rem' }}>Loading dashboard...</div>;

  const statusColors = { IN_CUSTODY: 'red', RELEASED: 'green', TRANSFERRED: 'blue', HOSPITALISED: 'amber', ESCAPED: 'red', DECEASED: 'gray' };

  return (
    <div>
      <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1>{user?.station?.name || 'Dashboard'}</h1>
          <p style={{ color: 'var(--text-muted)', marginTop: '0.25rem', fontSize: '0.9rem' }}>
            {new Date().toLocaleDateString('en-PG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowBooking(true)}>+ New Booking</button>
      </div>

      <div
        className="card"
        style={{
          marginBottom: '1.5rem',
          borderLeft: '4px solid var(--gold, #d4af37)',
          background: 'var(--bg-secondary, #faf8f2)',
          cursor: 'pointer',
        }}
        onClick={() => setShowBooking(true)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', padding: '0.5rem 0' }}>
          <div style={{ fontSize: '2.5rem' }}>📷🖐️</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '1.15rem', fontWeight: 700 }}>Booking Tracker</div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '0.25rem' }}>
              Scan the offender's face or fingerprint to check for an existing record across all stations,
              then add a new offense or start a fresh booking.
            </div>
          </div>
          <button className="btn btn-primary" onClick={(e) => { e.stopPropagation(); setShowBooking(true); }}>
            Start Scan →
          </button>
        </div>
      </div>

      {showBooking && (
        <BookingModal onClose={() => setShowBooking(false)} onBooked={handleBooked} />
      )}

      <div className="stat-grid">
        <div className="stat-card red">
          <div className="stat-label">In Custody</div>
          <div className="stat-value" style={{ color: 'var(--red)' }}>{stats?.inCustody ?? '—'}</div>
          <div className="stat-sub">Currently detained</div>
        </div>
        <div className="stat-card green">
          <div className="stat-label">Today's Bookings</div>
          <div className="stat-value" style={{ color: 'var(--green)' }}>{stats?.todayBookings ?? '—'}</div>
          <div className="stat-sub">New since midnight</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total Records</div>
          <div className="stat-value">{stats?.total ?? '—'}</div>
          <div className="stat-sub">All time</div>
        </div>
        {stats?.byStatus?.map(s => (
          <div key={s.status} className={`stat-card ${statusColors[s.status] || ''}`}>
            <div className="stat-label">{s.status.replace('_', ' ')}</div>
            <div className="stat-value">{s._count}</div>
            <div className="stat-sub">detainees</div>
          </div>
        ))}
      </div>

      {biometricStats && (
        <div className="card" style={{ marginBottom: '1.5rem', borderLeft: '4px solid var(--purple, #7c3aed)' }}>
          <div className="card-header">
            <h2>🔍 Biometric Identification</h2>
          </div>
          <div style={{ display: 'flex', gap: '2rem', padding: '0.5rem 0', flexWrap: 'wrap' }}>
            <div>
              <div className="stat-label">Offenders identified (all stations)</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{biometricStats.totalOffenders}</div>
            </div>
            <div>
              <div className="stat-label">Face records on file</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{biometricStats.totalFaceBiometrics}</div>
            </div>
            <div>
              <div className="stat-label">Repeat offenders caught at this station</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--amber, #d97706)' }}>{biometricStats.recentMatchesAtStation}</div>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <h2>Currently In Custody</h2>
          <Link to="/detainees?status=IN_CUSTODY" className="btn btn-ghost btn-sm">View All →</Link>
        </div>
        {recent.length === 0 ? (
          <div className="table-empty">
            <div className="icon">📋</div>
            <p>No detainees currently in custody</p>
            <button className="btn btn-primary" onClick={() => setShowBooking(true)} style={{ marginTop: '1rem' }}>+ New Booking</button>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Custody #</th>
                  <th>Name</th>
                  <th>Cell</th>
                  <th>Charges</th>
                  <th>Risk</th>
                  <th>Booked</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {recent.map(d => (
                  <tr key={d.id}>
                    <td><span className="badge badge-gold">{d.custodyNumber}</span></td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{d.firstName} {d.lastName}</div>
                      {d.alias && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>aka {d.alias}</div>}
                    </td>
                    <td>{d.cell?.cellNumber || <span style={{ color: 'var(--text-muted)' }}>Unassigned</span>}</td>
                    <td style={{ maxWidth: 200 }}>{d.charges?.join(', ') || d.offense || '—'}</td>
                    <td><span className={`risk-${d.riskLevel}`}>{d.riskLevel}</span></td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {new Date(d.bookingTime).toLocaleString('en-PG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td>
                      <Link to={`/detainees/${d.id}`} className="btn btn-ghost btn-sm">View</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {user?.station?.subscriptionStatus === 'TRIAL' && (
        <div className="alert alert-warn" style={{ marginTop: '1rem' }}>
          ⏰ <strong>Trial Mode:</strong> Your station is on a free trial.
          Trial expires: {user.station.trialEndsAt ? new Date(user.station.trialEndsAt).toLocaleDateString() : 'N/A'}.
          Contact your administrator to activate a subscription.
        </div>
      )}
    </div>
  );
}
