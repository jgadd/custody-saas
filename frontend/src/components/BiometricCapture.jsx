import { useState, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import api from '../lib/api';

/**
 * BiometricCapture
 *
 * Lets the officer identify an offender via face scan (real matching,
 * searched across all stations) or fingerprint scan (Phase 1: stored
 * as an image only — no automated matching yet, since that requires
 * dedicated AFIS hardware/software the department hasn't procured).
 *
 * Fingerprint capture works with any USB scanner that has a Windows
 * driver exposing it as a standard image-capture device — the officer
 * scans via the scanner's own capture software, then uploads the
 * resulting image file here, the same as uploading a photo.
 *
 * Props:
 *   onMatchFound(offender, confidence)  — face match confirmed
 *   onNoMatch(descriptor, photoBase64, photoPreviewUrl) — proceed as new offender
 *   onSkip()                            — officer skips biometric capture entirely
 *
 * Ref:
 *   attachPendingFingerprint(offenderId) — call once the offenderId for
 *   this booking is known, to save any fingerprint scan captured here.
 */
const BiometricCapture = forwardRef(function BiometricCapture({ onMatchFound, onNoMatch, onSkip }, ref) {
  const [mode, setMode] = useState('idle'); // idle | camera | searching | result
  const [photoPreview, setPhotoPreview] = useState(null);
  const [photoFile, setPhotoFile] = useState(null);
  const [fingerprintFile, setFingerprintFile] = useState(null);
  const [fingerprintPreview, setFingerprintPreview] = useState(null);
  const [fingerPosition, setFingerPosition] = useState('RIGHT_INDEX');
  const [searchResult, setSearchResult] = useState(null);
  const [error, setError] = useState('');
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const startCamera = useCallback(async () => {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      streamRef.current = stream;
      setMode('camera');
      setTimeout(() => {
        if (videoRef.current) videoRef.current.srcObject = stream;
      }, 50);
    } catch (e) {
      setError('Could not access the camera. You can upload a photo instead.');
    }
  }, []);

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  };

  const capturePhoto = () => {
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    canvas.toBlob(blob => {
      setPhotoFile(blob);
      setPhotoPreview(canvas.toDataURL('image/jpeg'));
      stopCamera();
      setMode('idle');
    }, 'image/jpeg', 0.92);
  };

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const handleFingerprintUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFingerprintFile(file);
    setFingerprintPreview(URL.createObjectURL(file));
  };

  const attachPendingFingerprint = async (offenderId) => {
    if (!fingerprintFile || !offenderId) return;
    try {
      const formData = new FormData();
      formData.append('scan', fingerprintFile, 'fingerprint.jpg');
      formData.append('offenderId', offenderId);
      formData.append('fingerPosition', fingerPosition);
      await api.post('/biometrics/fingerprint/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    } catch (e) {
      console.error('Fingerprint attach failed:', e);
    }
  };

  const runSearch = async () => {
    if (!photoFile) return;
    setMode('searching');
    setError('');
    try {
      const formData = new FormData();
      formData.append('photo', photoFile, 'capture.jpg');
      const res = await api.post('/biometrics/face/search', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setSearchResult(res.data);
      setMode('result');
    } catch (e) {
      setError(e.response?.data?.error || 'Search failed. Please try again or skip biometric capture.');
      setMode('idle');
    }
  };

  useImperativeHandle(ref, () => ({ attachPendingFingerprint }));

  const reset = () => {
    setPhotoFile(null);
    setPhotoPreview(null);
    setSearchResult(null);
    setError('');
    setMode('idle');
  };

  const FINGER_POSITIONS = [
    { value: 'RIGHT_THUMB', label: 'Right thumb' },
    { value: 'RIGHT_INDEX', label: 'Right index' },
    { value: 'RIGHT_MIDDLE', label: 'Right middle' },
    { value: 'RIGHT_RING', label: 'Right ring' },
    { value: 'RIGHT_LITTLE', label: 'Right little' },
    { value: 'LEFT_THUMB', label: 'Left thumb' },
    { value: 'LEFT_INDEX', label: 'Left index' },
    { value: 'LEFT_MIDDLE', label: 'Left middle' },
    { value: 'LEFT_RING', label: 'Left ring' },
    { value: 'LEFT_LITTLE', label: 'Left little' },
  ];

  const FingerprintPanel = () => (
    <div className="fingerprint-panel fade-in">
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600, marginBottom: '0.4rem' }}>
        <i className="ti ti-fingerprint" style={{ color: 'var(--gold)' }} />
        Fingerprint scan
        <span style={{ fontSize: '0.7rem', fontWeight: 400, color: 'var(--text-muted)', textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
      </div>
      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem', lineHeight: 1.5 }}>
        Scan with your station's fingerprint device, then upload the saved image.
        Matching against other records isn't available yet — this scan is stored
        on file once an offender record is created or matched by face.
      </p>
      {fingerprintPreview ? (
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <img src={fingerprintPreview} alt="Fingerprint scan" className="fingerprint-preview" />
          <div style={{ flex: 1, minWidth: 180 }}>
            <select value={fingerPosition} onChange={e => setFingerPosition(e.target.value)} style={{ marginBottom: '0.5rem' }}>
              {FINGER_POSITIONS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
            <button className="btn btn-ghost btn-sm" onClick={() => { setFingerprintFile(null); setFingerprintPreview(null); }}>
              <i className="ti ti-x" /> Remove
            </button>
          </div>
        </div>
      ) : (
        <label className="btn btn-ghost" style={{ cursor: 'pointer' }}>
          <i className="ti ti-upload" /> Upload fingerprint scan
          <input type="file" accept="image/*" onChange={handleFingerprintUpload} style={{ display: 'none' }} />
        </label>
      )}
    </div>
  );

  return (
    <div>
      <div className="alert alert-info" style={{ marginBottom: '1.25rem' }}>
        <i className="ti ti-info-circle" />
        Scan the offender's face and/or fingerprint to check for an existing record at any station.
        This step is optional but recommended.
      </div>

      {error && (
        <div className="alert alert-error fade-in" style={{ marginBottom: '1rem' }}>
          <i className="ti ti-alert-triangle" /> {error}
        </div>
      )}

      {mode === 'idle' && !photoPreview && (
        <div className="fade-in">
          <div className="scan-mode-grid">
            <div className="scan-mode-btn" onClick={startCamera}>
              <i className="ti ti-camera" />
              <span className="label">Use camera</span>
              <span className="hint">Live face scan</span>
            </div>
            <label className="scan-mode-btn" style={{ cursor: 'pointer' }}>
              <i className="ti ti-photo" />
              <span className="label">Upload photo</span>
              <span className="hint">From device storage</span>
              <input type="file" accept="image/*" onChange={handleFileUpload} style={{ display: 'none' }} />
            </label>
            <div className="scan-mode-btn" onClick={onSkip}>
              <i className="ti ti-pencil" />
              <span className="label">Manual entry</span>
              <span className="hint">Skip biometric scan</span>
            </div>
          </div>
          <FingerprintPanel />
        </div>
      )}

      {mode === 'camera' && (
        <div className="fade-in">
          <div className="scan-frame">
            <video ref={videoRef} autoPlay playsInline />
            <span className="scan-frame-badge">Live</span>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
            <button className="btn btn-primary" onClick={capturePhoto}><i className="ti ti-camera" /> Capture</button>
            <button className="btn btn-ghost" onClick={() => { stopCamera(); setMode('idle'); }}>Cancel</button>
          </div>
        </div>
      )}

      {mode === 'idle' && photoPreview && (
        <div className="fade-in">
          <div className="scan-frame" style={{ maxWidth: 220 }}>
            <img src={photoPreview} alt="Captured" />
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
            <button className="btn btn-primary" onClick={runSearch}><i className="ti ti-search" /> Search all stations</button>
            <button className="btn btn-ghost" onClick={reset}><i className="ti ti-refresh" /> Retake</button>
          </div>
        </div>
      )}

      {mode === 'searching' && (
        <div className="scan-pulse fade-in">
          <div className="scan-pulse-ring" />
          <div className="scan-pulse-text">Searching biometric records across all stations…</div>
        </div>
      )}

      {mode === 'result' && searchResult && (
        <div className="fade-in">
          <div className="scan-frame" style={{ maxWidth: 160, marginBottom: '1.25rem' }}>
            <img src={photoPreview} alt="Captured" />
          </div>

          {searchResult.match ? (
            <div>
              <div className="match-card" style={{ marginBottom: '1rem' }}>
                <img src={photoPreview} alt="" className="avatar" />
                <div style={{ flex: 1 }}>
                  <div className="name">
                    {searchResult.match.offender.firstName} {searchResult.match.offender.lastName}
                    {searchResult.match.offender.alias && (
                      <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}> (aka {searchResult.match.offender.alias})</span>
                    )}
                  </div>
                  <div className="offender-no">Offender No. {searchResult.match.offender.offenderNumber}</div>
                  <div className="meta">
                    {searchResult.match.priorBookingsCount} prior booking{searchResult.match.priorBookingsCount === 1 ? '' : 's'}
                    {searchResult.match.priorStations.length > 0 && <> — {searchResult.match.priorStations.join(', ')}</>}
                  </div>
                  <div style={{ marginTop: '0.6rem' }}>
                    <span className="confidence-pill">
                      <i className="ti ti-shield-check" /> {Math.round(searchResult.match.confidence * 100)}% match confidence
                    </span>
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <button className="btn btn-primary" onClick={() => onMatchFound(searchResult.match.offender, searchResult.match.confidence)}>
                  <i className="ti ti-check" /> Same person — add new offense
                </button>
                <button className="btn btn-ghost" onClick={() => onNoMatch(searchResult.descriptor, searchResult.photoBuffer, photoPreview)}>
                  Not a match — create new record
                </button>
                <button className="btn btn-ghost" onClick={reset}><i className="ti ti-refresh" /> Retake</button>
              </div>
            </div>
          ) : (
            <div>
              <div className="alert alert-success" style={{ marginBottom: '1rem' }}>
                <i className="ti ti-circle-check" /> No existing record found — this will be a new offender.
              </div>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button className="btn btn-primary" onClick={() => onNoMatch(searchResult.descriptor, searchResult.photoBuffer, photoPreview)}>
                  <i className="ti ti-user-plus" /> Continue with new offender
                </button>
                <button className="btn btn-ghost" onClick={reset}><i className="ti ti-refresh" /> Retake</button>
              </div>
            </div>
          )}

          <FingerprintPanel />
        </div>
      )}
    </div>
  );
});

export default BiometricCapture;
