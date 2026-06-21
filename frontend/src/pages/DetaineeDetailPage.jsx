import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import useAuthStore from '../store/authStore';

export default function DetaineeDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [detainee, setDetainee] = useState(null);
  const [loading, setLoading] = useState(true);
  const [releasing, setReleasing] = useState(false);
  const [releaseReason, setReleaseReason] = useState('');
  const [showRelease, setShowRelease] = useState(false);
  const [activeTab, setActiveTab] = useState('details');

  useEffect(() => {
    api.get(`/detainees/${id}`).then(r => setDetainee(r.data)).finally(() => setLoading(false));
  }, [id]);

  const handleRelease = async () => {
    if (!releaseReason) return;
    setReleasing(true);
    try {
      await api.post(`/detainees/${id}/release`, { releaseReason });
      setDetainee(d => ({ ...d, status: 'RELEASED', releaseTime: new Date().toISOString(), releaseReason }));
      setShowRelease(false);
    } finally {
      setReleasing(false);
    }
  };

  if (loading) return <div style={{ padding: '2rem', color: 'var(--text-muted)' }}>Loading...</div>;
  if (!detainee) return <div style={{ padding: '2rem', color: 'var(--red)' }}>Detainee not found.</div>;

  const d = detainee;
  const inCustody = d.status === 'IN_CUSTODY';
  const dur = d.bookingTime ? (() => {
    const diff = Date.now() - new Date(d.bookingTime).getTime();
    const h = Math.floor(diff/3600000); const m = Math.floor((diff%3600000)/60000);
    return h > 48 ? `${Math.floor(h/24)} days` : `${h}h ${m}m`;
  })() : '—';

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)}>← Back</button>
        <div style={{ flex: 1 }}>
          <h1>{d.firstName} {d.lastName}</h1>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            {d.custodyNumber} · {d.rank || ''} {d.gender}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <span className={`badge ${d.status === 'IN_CUSTODY' ? 'badge-red' : d.status === 'RELEASED' ? 'badge-green' : 'badge-gray'}`}>
            {d.status.replace('_', ' ')}
          </span>
          <span className={`risk-${d.riskLevel}`} style={{ fontWeight: 700 }}>⚠ {d.riskLevel} RISK</span>
          {inCustody && (user?.role === 'STATION_ADMIN' || user?.role === 'DUTY_SERGEANT' || user?.role === 'SUPER_ADMIN') && (
            <button className="btn btn-success btn-sm" onClick={() => setShowRelease(true)}>🔓 Release</button>
          )}
          <button className="btn btn-ghost btn-sm no-print" onClick={() => window.print()}>🖨 Print</button>
        </div>
      </div>

      {inCustody && (
        <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px,1fr))', marginBottom: '1.5rem' }}>
          <div className="stat-card red">
            <div className="stat-label">Time in Custody</div>
            <div className="stat-value" style={{ fontSize: '1.5rem', color: 'var(--amber)' }}>{dur}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Cell</div>
            <div className="stat-value" style={{ fontSize: '1.5rem' }}>{d.cell?.cellNumber || '—'}</div>
            <div className="stat-sub">{d.cell?.type || 'Unassigned'}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Court Date</div>
            <div className="stat-value" style={{ fontSize: '1.25rem' }}>{d.courtDate ? new Date(d.courtDate).toLocaleDateString() : '—'}</div>
          </div>
        </div>
      )}

      <div className="tabs">
        {['details','charges','legal','reviews','history'].map(t => (
          <button key={t} className={`tab ${activeTab === t ? 'active' : ''}`} onClick={() => setActiveTab(t)}>
            {t === 'details' ? 'Personal' : t === 'charges' ? 'Charges' : t === 'legal' ? 'Legal' : t === 'reviews' ? 'Welfare Reviews' : 'Offender History'}
          </button>
        ))}
      </div>

      {activeTab === 'details' && (
        <div className="card">
          <div className="detail-section">
            <h3>Personal Information</h3>
            <div className="detail-grid">
              {[
                ['Date of Birth', d.dateOfBirth ? new Date(d.dateOfBirth).toLocaleDateString() : '—'],
                ['Gender', d.gender], ['Nationality', d.nationality],
                ['Alias', d.alias || '—'], ['Address', d.address || '—'],
                ['Phone', d.phone || '—'], ['Next of Kin', d.nextOfKin || '—'],
                ['NOK Phone', d.nextOfKinPhone || '—']
              ].map(([l, v]) => (
                <div key={l} className="detail-item"><div className="label">{l}</div><div className="value">{v}</div></div>
              ))}
            </div>
          </div>
          <div className="detail-section">
            <h3>Booking Information</h3>
            <div className="detail-grid">
              {[
                ['Booking Time', new Date(d.bookingTime).toLocaleString()],
                ['Arresting Officer', d.arrestingOfficer],
                ['Arrest Location', d.arrestLocation || '—'],
                ['Booked By', `${d.createdBy?.name} (${d.createdBy?.badgeNumber})`],
                ['Warrant #', d.warrantNumber || '—'],
              ].map(([l, v]) => (
                <div key={l} className="detail-item"><div className="label">{l}</div><div className="value">{v}</div></div>
              ))}
            </div>
          </div>
          {d.healthNotes && (
            <div className="detail-section">
              <h3>Health & Medical</h3>
              <div style={{ background: 'var(--input-bg)', padding: '0.75rem', borderRadius: '6px', fontSize: '0.9rem' }}>{d.healthNotes}</div>
            </div>
          )}
          {d.propertyList && (
            <div className="detail-section">
              <h3>Property in Custody</h3>
              <div style={{ background: 'var(--input-bg)', padding: '0.75rem', borderRadius: '6px', fontSize: '0.9rem' }}>{typeof d.propertyList === 'string' ? d.propertyList : JSON.stringify(d.propertyList, null, 2)}</div>
            </div>
          )}
          {!inCustody && d.releaseTime && (
            <div className="detail-section">
              <h3>Release Information</h3>
              <div className="detail-grid">
                {[
                  ['Release Time', new Date(d.releaseTime).toLocaleString()],
                  ['Release Reason', d.releaseReason || '—'],
                  ['Released By', d.releasedBy?.name || '—'],
                ].map(([l, v]) => (
                  <div key={l} className="detail-item"><div className="label">{l}</div><div className="value">{v}</div></div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'charges' && (
        <div className="card">
          <div className="detail-section">
            <h3>Charges & Offenses</h3>
            <div style={{ marginBottom: '1rem' }}>
              <div className="stat-label">Category</div>
              <div style={{ marginTop: '0.25rem' }}><span className="badge badge-red">{d.offenseCategory?.replace('_',' ')}</span></div>
            </div>
            {d.charges?.length > 0 && (
              <div style={{ marginBottom: '1rem' }}>
                <div className="stat-label" style={{ marginBottom: '0.5rem' }}>Charges</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  {d.charges.map(c => <span key={c} className="badge badge-amber">{c}</span>)}
                </div>
              </div>
            )}
            {d.offense && (
              <div>
                <div className="stat-label" style={{ marginBottom: '0.5rem' }}>Offense Details</div>
                <div style={{ background: 'var(--input-bg)', padding: '0.75rem', borderRadius: '6px' }}>{d.offense}</div>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'legal' && (
        <div className="card">
          <div className="detail-section">
            <h3>Legal Details</h3>
            <div className="detail-grid">
              {[
                ['Court Date', d.courtDate ? new Date(d.courtDate).toLocaleDateString() : '—'],
                ['Bail Amount', d.bailAmount ? `PGK ${Number(d.bailAmount).toLocaleString()}` : 'Not set'],
                ['Lawyer', d.lawyerName || '—'],
                ['Lawyer Phone', d.lawyerPhone || '—'],
              ].map(([l, v]) => (
                <div key={l} className="detail-item"><div className="label">{l}</div><div className="value">{v}</div></div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'reviews' && (
        <WelfareReviews detaineeId={id} reviews={d.reviews || []} inCustody={inCustody} user={user} />
      )}

      {activeTab === 'history' && (
        <div className="card">
          <div className="detail-section">
            <h3>Offender Identity</h3>
            {d.offender ? (
              <div className="detail-grid">
                <div className="detail-item"><div className="label">Offender No.</div><div className="value">{d.offender.offenderNumber}</div></div>
                <div className="detail-item"><div className="label">First seen</div><div className="value">{new Date(d.offender.firstSeenAt).toLocaleDateString()}</div></div>
                <div className="detail-item"><div className="label">Identified via</div>
                  <div className="value">
                    {d.matchMethod === 'FACE_MATCH' ? `Face match (${Math.round((d.matchConfidence || 0) * 100)}% confidence)`
                      : d.matchMethod === 'NEW_OFFENDER' ? 'New offender at intake'
                      : 'Manual entry'}
                  </div>
                </div>
              </div>
            ) : (
              <p style={{ color: 'var(--text-muted)' }}>No linked offender identity on this booking.</p>
            )}
          </div>

          {d.offender?.biometrics?.[0]?.facePhotoUrl && (
            <div className="detail-section">
              <h3>Photo on file</h3>
              <img src={d.offender.biometrics[0].facePhotoUrl} alt="Offender" style={{ width: 150, borderRadius: 8 }} />
            </div>
          )}

          <div className="detail-section">
            <h3>Prior bookings at other stations</h3>
            {!d.offender?.bookings?.length ? (
              <p style={{ color: 'var(--text-muted)' }}>No other bookings found for this offender.</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>Station</th><th>Custody #</th><th>Charges</th><th>Status</th><th>Booked</th></tr>
                  </thead>
                  <tbody>
                    {d.offender.bookings.map(b => (
                      <tr key={b.id}>
                        <td>{b.station?.name}</td>
                        <td><span className="badge badge-gold">{b.custodyNumber}</span></td>
                        <td>{b.charges?.join(', ') || b.offense || '—'}</td>
                        <td><span className={`badge ${b.status === 'IN_CUSTODY' ? 'badge-red' : 'badge-green'}`}>{b.status.replace('_',' ')}</span></td>
                        <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{new Date(b.bookingTime).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {showRelease && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 440 }}>
            <div className="modal-header"><h2>🔓 Release Detainee</h2></div>
            <div className="modal-body">
              <p style={{ marginBottom: '1rem' }}>Releasing: <strong>{d.firstName} {d.lastName}</strong> ({d.custodyNumber})</p>
              <div className="form-group">
                <label>Release Reason *</label>
                <select value={releaseReason} onChange={e => setReleaseReason(e.target.value)}>
                  <option value="">Select reason...</option>
                  <option value="Bail paid">Bail paid</option>
                  <option value="Charges dropped">Charges dropped</option>
                  <option value="Court order">Court order</option>
                  <option value="Transferred to remand">Transferred to remand</option>
                  <option value="No evidence">No evidence</option>
                  <option value="Cautioned and released">Cautioned and released</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowRelease(false)}>Cancel</button>
              <button className="btn btn-success" onClick={handleRelease} disabled={!releaseReason || releasing}>
                {releasing ? 'Releasing...' : '✓ Confirm Release'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function WelfareReviews({ detaineeId, reviews, inCustody, user }) {
  const [list, setList] = useState(reviews);
  const [form, setForm] = useState({ reviewType: 'welfare_check', notes: '' });
  const [adding, setAdding] = useState(false);

  const handleAdd = async () => {
    if (!form.notes) return;
    setAdding(true);
    try {
      const res = await api.post(`/detainees/${detaineeId}/reviews`, form);
      setList(l => [res.data, ...l]);
      setForm(f => ({ ...f, notes: '' }));
    } finally { setAdding(false); }
  };

  return (
    <div className="card">
      {inCustody && (
        <div style={{ marginBottom: '1.5rem', padding: '1rem', background: 'var(--input-bg)', borderRadius: '8px' }}>
          <h3 style={{ marginBottom: '0.75rem' }}>Add Welfare Check</h3>
          <div className="form-row">
            <div className="form-group">
              <label>Type</label>
              <select value={form.reviewType} onChange={e => setForm(f => ({ ...f, reviewType: e.target.value }))}>
                <option value="welfare_check">Welfare Check</option>
                <option value="medical">Medical Assessment</option>
                <option value="legal_review">Legal Review</option>
                <option value="meal">Meal Check</option>
              </select>
            </div>
          </div>
          <div className="form-group"><label>Notes</label>
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Enter welfare check notes..." />
          </div>
          <button className="btn btn-primary" onClick={handleAdd} disabled={adding || !form.notes}>
            {adding ? 'Adding...' : '+ Add Review'}
          </button>
        </div>
      )}
      {list.length === 0 ? (
        <div className="table-empty"><div>📋</div><p>No welfare reviews recorded</p></div>
      ) : (
        list.map(r => (
          <div key={r.id} style={{ padding: '0.75rem 0', borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
              <span className="badge badge-blue">{r.reviewType.replace('_',' ')}</span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                {new Date(r.reviewedAt).toLocaleString()} · {r.reviewedBy}
              </span>
            </div>
            <p style={{ fontSize: '0.9rem' }}>{r.notes}</p>
          </div>
        ))
      )}
    </div>
  );
}
