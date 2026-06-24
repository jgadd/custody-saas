import { useState, useEffect, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../lib/api';
import { getAllDetainees, saveDetaineeOffline } from '../lib/db';
import useAuthStore from '../store/authStore';
import RegisterBookingModal from '../components/RegisterBookingModal';

export default function DetaineesPage() {
  const { user } = useAuthStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const [detainees, setDetainees] = useState([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [showBooking, setShowBooking] = useState(false);
  const [online] = useState(navigator.onLine);

  const status = searchParams.get('status') || '';
  const search = searchParams.get('search') || '';
  const page = parseInt(searchParams.get('page') || '1');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (navigator.onLine) {
        const params = { page, limit: 20 };
        if (status) params.status = status;
        if (search) params.search = search;
        const res = await api.get('/detainees', { params });
        setDetainees(res.data.detainees);
        setTotal(res.data.total);
        setPages(res.data.pages);
      } else {
        const local = await getAllDetainees(user?.stationId);
        let filtered = local;
        if (status) filtered = filtered.filter(d => d.status === status);
        if (search) filtered = filtered.filter(d =>
          `${d.firstName} ${d.lastName} ${d.custodyNumber}`.toLowerCase().includes(search.toLowerCase())
        );
        setDetainees(filtered.slice((page-1)*20, page*20));
        setTotal(filtered.length);
        setPages(Math.ceil(filtered.length/20));
      }
    } catch (e) {
      console.error(e);
      const local = await getAllDetainees(user?.stationId);
      setDetainees(local);
    } finally {
      setLoading(false);
    }
  }, [page, status, search, user]);

  useEffect(() => { load(); }, [load]);

  const handleBooked = (detainee) => {
    setShowBooking(false);
    load();
  };

  const statusBadge = s => {
    const map = { IN_CUSTODY: 'badge-red', RELEASED: 'badge-green', TRANSFERRED: 'badge-blue', HOSPITALISED: 'badge-amber', ESCAPED: 'badge-red', DECEASED: 'badge-gray' };
    return <span className={`badge ${map[s] || 'badge-gray'}`}>{s.replace('_',' ')}</span>;
  };

  return (
    <div>
      <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
        <h1>Custody Register</h1>
        <button className="btn btn-primary" onClick={() => setShowBooking(true)}>+ New Booking</button>
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <div className="search-bar" style={{ maxWidth: '320px' }}>
            <span>🔍</span>
            <input placeholder="Search name, custody number..." value={search}
              onChange={e => setSearchParams(p => { p.set('search', e.target.value); p.set('page', '1'); return p; })} />
          </div>
          <select value={status} onChange={e => setSearchParams(p => { p.set('status', e.target.value); p.set('page', '1'); return p; })}
            style={{ width: 'auto' }}>
            <option value="">All Status</option>
            <option value="IN_CUSTODY">In Custody</option>
            <option value="RELEASED">Released</option>
            <option value="TRANSFERRED">Transferred</option>
            <option value="HOSPITALISED">Hospitalised</option>
            <option value="ESCAPED">Escaped</option>
          </select>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginLeft: 'auto' }}>
            {total} record{total !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      <div className="card">
        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</div>
        ) : detainees.length === 0 ? (
          <div className="table-empty">
            <div className="icon">📋</div>
            <p>No detainees found</p>
            {!status && !search && (
              <button className="btn btn-primary" style={{ marginTop: '1rem' }} onClick={() => setShowBooking(true)}>
                + New Booking
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Custody #</th>
                    <th>Detainee</th>
                    <th>Status</th>
                    <th>Cell</th>
                    <th>Charges</th>
                    <th>Risk</th>
                    <th>Officer</th>
                    <th>Booked</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {detainees.map(d => (
                    <tr key={d.id}>
                      <td>
                        <span className="badge badge-gold">{d.custodyNumber || '(pending sync)'}</span>
                        {d._syncStatus === 'pending' && <span className="badge badge-amber" style={{ marginLeft: '0.25rem' }}>⏳</span>}
                      </td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{d.firstName} {d.lastName}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{d.gender} · {d.nationality}</div>
                      </td>
                      <td>{statusBadge(d.status)}</td>
                      <td>{d.cell?.cellNumber || '—'}</td>
                      <td style={{ maxWidth: 180, fontSize: '0.8rem' }}>{(d.charges || []).join(', ') || d.offense || '—'}</td>
                      <td><span className={`risk-${d.riskLevel}`}>● {d.riskLevel}</span></td>
                      <td style={{ fontSize: '0.8rem' }}>{d.createdBy?.name || d.arrestingOfficer}</td>
                      <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
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
            {pages > 1 && (
              <div className="pagination">
                <button className="page-btn" disabled={page === 1} onClick={() => setSearchParams(p => { p.set('page', String(page-1)); return p; })}>‹ Prev</button>
                {Array.from({length: Math.min(pages, 7)}, (_, i) => i + Math.max(1, page-3)).filter(n => n <= pages).map(n => (
                  <button key={n} className={`page-btn ${n === page ? 'active' : ''}`} onClick={() => setSearchParams(p => { p.set('page', String(n)); return p; })}>{n}</button>
                ))}
                <button className="page-btn" disabled={page === pages} onClick={() => setSearchParams(p => { p.set('page', String(page+1)); return p; })}>Next ›</button>
              </div>
            )}
          </>
        )}
      </div>

      {showBooking && (
        <RegisterBookingModal onClose={() => setShowBooking(false)} onBooked={handleBooked} />
      )}
    </div>
  );
}
