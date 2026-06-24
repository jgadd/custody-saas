import { useState } from 'react';
import api from '../lib/api';
import useAuthStore from '../store/authStore';

export default function ReportsPage() {
  const { user } = useAuthStore();
  const [from, setFrom] = useState(new Date(Date.now() - 7*86400000).toISOString().split('T')[0]);
  const [to, setTo] = useState(new Date().toISOString().split('T')[0]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const generate = async () => {
    setLoading(true);
    try {
      const [stats, all] = await Promise.all([
        api.get('/detainees/stats'),
        api.get('/detainees', { params: { limit: 1000, from, to } })
      ]);
      setData({ stats: stats.data, detainees: all.data.detainees, total: all.data.total });
    } finally { setLoading(false); }
  };

  const printReport = () => window.print();

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h1>Reports</h1>
        {data && <button className="btn btn-ghost no-print" onClick={printReport}>🖨 Print Report</button>}
      </div>

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ marginBottom: '1rem' }}>Detainee Register Report</h3>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>From Date</label>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>To Date</label>
            <input type="date" value={to} onChange={e => setTo(e.target.value)} />
          </div>
          <button className="btn btn-primary" onClick={generate} disabled={loading}>{loading ? 'Generating...' : '📊 Generate Report'}</button>
        </div>
      </div>

      {data && (
        <div id="report-content">
          <div className="card" style={{ marginBottom: '1rem', textAlign: 'center' }}>
            <h2>ROYAL PAPUA NEW GUINEA CONSTABULARY</h2>
            <h3>{user?.station?.name} — Detainee Register Report</h3>
            <p style={{ color: 'var(--text-muted)', marginTop: '0.25rem' }}>
              Period: {new Date(from).toLocaleDateString()} — {new Date(to).toLocaleDateString()}
            </p>
          </div>

          <div className="stat-grid" style={{ marginBottom: '1rem' }}>
            <div className="stat-card"><div className="stat-label">Total Bookings</div><div className="stat-value">{data.total}</div></div>
            <div className="stat-card red"><div className="stat-label">Still In Custody</div><div className="stat-value" style={{ color: 'var(--red)' }}>{data.stats.inCustody}</div></div>
            <div className="stat-card green"><div className="stat-label">Released</div><div className="stat-value" style={{ color: 'var(--green)' }}>{data.detainees.filter(d => d.status === 'RELEASED').length}</div></div>
          </div>

          <div className="card">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>#</th><th>Custody No.</th><th>Name</th><th>Gender</th><th>Charges</th><th>Cell</th><th>Risk</th><th>Booked</th><th>Status</th><th>Released</th>
                  </tr>
                </thead>
                <tbody>
                  {data.detainees.map((d, i) => (
                    <tr key={d.id}>
                      <td>{i+1}</td>
                      <td><strong>{d.custodyNumber}</strong></td>
                      <td>{d.firstName} {d.lastName}</td>
                      <td>{d.gender}</td>
                      <td style={{ fontSize: '0.75rem' }}>{(d.charges || []).join(', ') || d.offense}</td>
                      <td>{d.cell?.cellNumber || '—'}</td>
                      <td className={`risk-${d.riskLevel}`}>{d.riskLevel}</td>
                      <td style={{ fontSize: '0.75rem' }}>{new Date(d.bookingTime).toLocaleString()}</td>
                      <td>{d.status.replace('_',' ')}</td>
                      <td style={{ fontSize: '0.75rem' }}>{d.releaseTime ? new Date(d.releaseTime).toLocaleString() : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div style={{ marginTop: '1rem', textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Report generated: {new Date().toLocaleString()} · {user?.name} ({user?.badgeNumber})
          </div>
        </div>
      )}
    </div>
  );
}
