import { useState, useEffect } from 'react';
import api from '../lib/api';
import { saveDetaineeOffline } from '../lib/db';
import useAuthStore from '../store/authStore';
import { v4 as uuidv4 } from 'uuid';
import BiometricCapture from './BiometricCapture';

const CHARGES = ['Assault', 'Armed Robbery', 'Theft', 'Drug Possession', 'Drug Trafficking', 'Murder', 'Rape', 'Domestic Violence', 'Traffic Offence', 'Drunk and Disorderly', 'Criminal Trespass', 'Fraud', 'Arson', 'Wilful Damage', 'Other'];

export default function BookingModal({ onClose, onBooked }) {
  const { user } = useAuthStore();
  const [cells, setCells] = useState([]);
  const [step, setStep] = useState(0); // step 0 = biometric capture
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Biometric linkage carried through to submission
  const [matchedOffender, setMatchedOffender] = useState(null); // existing offender, if matched
  const [matchConfidenceValue, setMatchConfidenceValue] = useState(null); // confidence score from face search
  const [newOffenderBiometric, setNewOffenderBiometric] = useState(null); // { descriptor, photoBuffer } for new offender
  const [matchMethod, setMatchMethod] = useState('MANUAL'); // FACE_MATCH | MANUAL | NEW_OFFENDER
  const [biometricStepDone, setBiometricStepDone] = useState(false);

  const [form, setForm] = useState({
    firstName: '', lastName: '', alias: '', dateOfBirth: '', gender: 'MALE',
    nationality: 'Papua New Guinean', address: '', phone: '', nextOfKin: '', nextOfKinPhone: '',
    arrestingOfficer: user?.name || '', arrestLocation: '', bookingTime: new Date().toISOString().slice(0,16),
    charges: [], offense: '', offenseCategory: 'OTHER',
    cellId: '', riskLevel: 'LOW', healthNotes: '', warrantNumber: '',
    courtDate: '', bailAmount: '', lawyerName: '', lawyerPhone: '',
    propertyList: ''
  });

  useEffect(() => {
    if (navigator.onLine) {
      api.get('/cells').then(r => setCells(r.data)).catch(console.error);
    }
  }, []);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const toggleCharge = c => {
    set('charges', form.charges.includes(c) ? form.charges.filter(x => x !== c) : [...form.charges, c]);
  };

  // Biometric step 0 handlers
  const handleMatchFound = (offender, confidence) => {
    setMatchedOffender(offender);
    setMatchConfidenceValue(confidence);
    setMatchMethod('FACE_MATCH');
    setBiometricStepDone(true);
    // Pre-fill the form with the matched offender's known details
    setForm(f => ({
      ...f,
      firstName: offender.firstName,
      lastName: offender.lastName,
      alias: offender.alias || '',
      dateOfBirth: offender.dateOfBirth ? offender.dateOfBirth.slice(0, 10) : '',
      gender: offender.gender,
      nationality: offender.nationality,
      ethnicity: offender.ethnicity || '',
    }));
    setStep(1);
  };

  const handleNoMatch = (descriptor, photoBuffer) => {
    setNewOffenderBiometric({ descriptor, photoBuffer });
    setMatchMethod('NEW_OFFENDER');
    setBiometricStepDone(true);
    setStep(1);
  };

  const handleSkipBiometric = () => {
    setMatchMethod('MANUAL');
    setBiometricStepDone(true);
    setStep(1);
  };

  const handleSubmit = async () => {
    if (!form.firstName || !form.lastName) { setError('First and last name are required'); return; }
    if (form.charges.length === 0 && !form.offense) { setError('At least one charge is required'); return; }
    setLoading(true); setError('');

    try {
      // Resolve the offenderId before creating the booking.
      let offenderId = matchedOffender?.id;

      if (!offenderId && matchMethod === 'NEW_OFFENDER' && navigator.onLine) {
        // Create the persistent Offender identity now, carrying over the
        // face descriptor already extracted during the search step so we
        // don't need to re-upload or re-process the photo.
        const offenderRes = await api.post('/biometrics/offenders', {
          firstName: form.firstName,
          lastName: form.lastName,
          alias: form.alias,
          dateOfBirth: form.dateOfBirth,
          gender: form.gender,
          nationality: form.nationality,
          ethnicity: form.ethnicity,
          descriptor: newOffenderBiometric?.descriptor,
          photoBuffer: newOffenderBiometric?.photoBuffer,
        });
        offenderId = offenderRes.data.id;
      }

      const data = {
        ...form,
        bookingTime: new Date(form.bookingTime).toISOString(),
        status: 'IN_CUSTODY',
        stationId: user?.stationId,
        offenderId,
        matchMethod,
        matchConfidence: matchMethod === 'FACE_MATCH' ? matchConfidenceValue : null,
      };
      if (!data.cellId) delete data.cellId;
      if (!data.courtDate) delete data.courtDate;
      if (!data.bailAmount) delete data.bailAmount;
      if (!data.propertyList) delete data.propertyList;

      if (navigator.onLine) {
        const res = await api.post('/detainees', data);
        onBooked(res.data);
      } else {
        // Offline: offender creation requires a server round-trip for the
        // face match, so offline-created bookings always fall back to
        // manual entry — they sync as MANUAL and can be linked to an
        // Offender later by station staff once back online.
        const offline = { ...data, id: uuidv4(), custodyNumber: '(pending)', matchMethod: 'MANUAL', offenderId: null, _syncStatus: 'pending' };
        await saveDetaineeOffline(offline);
        onBooked(offline);
      }
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to create booking');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <h2>🔒 New Custody Booking</h2>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button>
        </div>

        <div className="tabs" style={{ padding: '0 1.5rem', marginBottom: 0, borderBottom: '1px solid var(--border)' }}>
          {['Identify Offender', 'Personal Details', 'Arrest & Charges', 'Cell & Health', 'Legal'].map((t, i) => (
            <button
              key={i}
              className={`tab ${step === i ? 'active' : ''}`}
              disabled={i > 0 && !biometricStepDone}
              onClick={() => setStep(i)}
            >{i === 0 ? '' : `${i}. `}{t}</button>
          ))}
        </div>

        <div className="modal-body" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
          {error && <div className="alert alert-error" style={{ marginBottom: '1rem' }}>⚠️ {error}</div>}

          {step === 0 && (
            <BiometricCapture
              onMatchFound={handleMatchFound}
              onNoMatch={handleNoMatch}
              onSkip={handleSkipBiometric}
            />
          )}

          {matchedOffender && step > 0 && (
            <div className="alert alert-success" style={{ marginBottom: '1rem' }}>
              Linked to existing offender <strong>{matchedOffender.offenderNumber}</strong> — adding a new offense to their record.
            </div>
          )}

          {step === 1 && (
            <div>
              <div className="form-row">
                <div className="form-group"><label>First Name *</label><input value={form.firstName} onChange={e => set('firstName', e.target.value)} required /></div>
                <div className="form-group"><label>Last Name *</label><input value={form.lastName} onChange={e => set('lastName', e.target.value)} required /></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label>Alias / Nickname</label><input value={form.alias} onChange={e => set('alias', e.target.value)} /></div>
                <div className="form-group"><label>Date of Birth</label><input type="date" value={form.dateOfBirth} onChange={e => set('dateOfBirth', e.target.value)} /></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label>Gender *</label>
                  <select value={form.gender} onChange={e => set('gender', e.target.value)}>
                    <option value="MALE">Male</option><option value="FEMALE">Female</option><option value="OTHER">Other</option>
                  </select>
                </div>
                <div className="form-group"><label>Nationality</label><input value={form.nationality} onChange={e => set('nationality', e.target.value)} /></div>
              </div>
              <div className="form-group"><label>Address</label><input value={form.address} onChange={e => set('address', e.target.value)} placeholder="Village / Settlement / Town" /></div>
              <div className="form-row">
                <div className="form-group"><label>Phone</label><input value={form.phone} onChange={e => set('phone', e.target.value)} /></div>
                <div className="form-group"><label>Next of Kin</label><input value={form.nextOfKin} onChange={e => set('nextOfKin', e.target.value)} /></div>
                <div className="form-group"><label>NOK Phone</label><input value={form.nextOfKinPhone} onChange={e => set('nextOfKinPhone', e.target.value)} /></div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <div className="form-row">
                <div className="form-group"><label>Arresting Officer *</label><input value={form.arrestingOfficer} onChange={e => set('arrestingOfficer', e.target.value)} /></div>
                <div className="form-group"><label>Arrest Location</label><input value={form.arrestLocation} onChange={e => set('arrestLocation', e.target.value)} /></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label>Booking Time</label><input type="datetime-local" value={form.bookingTime} onChange={e => set('bookingTime', e.target.value)} /></div>
                <div className="form-group"><label>Offense Category</label>
                  <select value={form.offenseCategory} onChange={e => set('offenseCategory', e.target.value)}>
                    {['VIOLENT','PROPERTY','DRUG','TRAFFIC','PUBLIC_ORDER','SEXUAL','FRAUD','OTHER'].map(c => <option key={c} value={c}>{c.replace('_',' ')}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label>Charges (select all that apply)</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.5rem' }}>
                  {CHARGES.map(c => (
                    <button key={c} type="button" onClick={() => toggleCharge(c)}
                      className={`btn btn-sm ${form.charges.includes(c) ? 'btn-primary' : 'btn-ghost'}`}>{c}</button>
                  ))}
                </div>
              </div>
              <div className="form-group"><label>Additional Details</label><textarea value={form.offense} onChange={e => set('offense', e.target.value)} placeholder="Describe the offense in detail..." /></div>
              <div className="form-group"><label>Warrant Number</label><input value={form.warrantNumber} onChange={e => set('warrantNumber', e.target.value)} /></div>
            </div>
          )}

          {step === 3 && (
            <div>
              <div className="form-group">
                <label>Assign Cell</label>
                <div className="cell-grid" style={{ marginTop: '0.5rem' }}>
                  <div className={`cell-card ${!form.cellId ? 'selected' : ''}`} onClick={() => set('cellId', '')}>
                    <div style={{ fontSize: '1.5rem' }}>🚫</div>
                    <div className="cell-type">Unassigned</div>
                  </div>
                  {cells.map(c => {
                    const occ = c._count?.detainees || 0;
                    const full = occ >= c.capacity;
                    return (
                      <div key={c.id} className={`cell-card ${full ? 'full' : ''} ${form.cellId === c.id ? 'selected' : ''}`}
                        onClick={() => !full && set('cellId', c.id)}>
                        <div className="cell-number">{c.cellNumber}</div>
                        <div className="cell-type">{c.type}</div>
                        <div className="cell-count" style={{ color: full ? 'var(--red)' : 'var(--text-muted)' }}>
                          {occ}/{c.capacity} {full ? '(FULL)' : ''}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="form-group">
                <label>Risk Level</label>
                <select value={form.riskLevel} onChange={e => set('riskLevel', e.target.value)}>
                  <option value="LOW">Low</option><option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option><option value="CRITICAL">Critical</option>
                </select>
              </div>
              <div className="form-group"><label>Health / Medical Notes</label><textarea value={form.healthNotes} onChange={e => set('healthNotes', e.target.value)} placeholder="Any medical conditions, medications, injuries..." /></div>
              <div className="form-group"><label>Property & Items List</label><textarea value={form.propertyList} onChange={e => set('propertyList', e.target.value)} placeholder="List of items taken into custody: wallet, phone, keys..." /></div>
            </div>
          )}

          {step === 4 && (
            <div>
              <div className="form-row">
                <div className="form-group"><label>Court Date</label><input type="date" value={form.courtDate} onChange={e => set('courtDate', e.target.value)} /></div>
                <div className="form-group"><label>Bail Amount (PGK)</label><input type="number" value={form.bailAmount} onChange={e => set('bailAmount', e.target.value)} placeholder="0.00" /></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label>Lawyer / Legal Rep</label><input value={form.lawyerName} onChange={e => set('lawyerName', e.target.value)} /></div>
                <div className="form-group"><label>Lawyer Phone</label><input value={form.lawyerPhone} onChange={e => set('lawyerPhone', e.target.value)} /></div>
              </div>
              <div className="alert alert-info" style={{ marginTop: '1rem' }}>
                <div>
                  <strong>Booking Summary</strong><br />
                  Detainee: <strong>{form.firstName} {form.lastName}</strong><br />
                  Charges: {form.charges.join(', ') || 'Not specified'}<br />
                  Risk: <span className={`risk-${form.riskLevel}`}>{form.riskLevel}</span><br />
                  Cell: {cells.find(c => c.id === form.cellId)?.cellNumber || 'Unassigned'}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          {step > 1 && <button className="btn btn-ghost" onClick={() => setStep(s => s-1)}>← Back</button>}
          {step >= 1 && step < 4
            ? <button className="btn btn-primary" onClick={() => setStep(s => s+1)}>Next →</button>
            : step === 4
            ? <button className="btn btn-primary" onClick={handleSubmit} disabled={loading}>
                {loading ? '⏳ Booking...' : '🔒 Confirm Booking'}
              </button>
            : null
          }
        </div>
      </div>
    </div>
  );
}
