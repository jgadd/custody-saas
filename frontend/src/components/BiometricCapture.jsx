import { useState, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import api from '../lib/api';
import { supportsFingerprintCapture } from '../lib/device';

/**
 * BiometricCapture
 *
 * First asks the officer to choose face scan or fingerprint scan, then
 * runs the chosen flow:
 *
 *   - Face scan: camera or photo upload, runs real matching against
 *     every offender across all stations.
 *   - Fingerprint scan: image upload from a USB scanner's own capture
 *     software. Phase 1 only — stored as an image, no automated
 *     matching yet (needs dedicated AFIS hardware/software). Not
 *     offered on phones, since a phone's fingerprint sensor can never
 *     be read by a web app — see lib/device.js.
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
  const [scanType, setScanType] = useState(null); // null | 'face' | 'fingerprint'
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

  const fingerprintAvailable = supportsFingerprintCapture();

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

  const resetFace = () => {
    setPhotoFile(null);
    setPhotoPreview(null);
    setSearchResult(null);
    setError('');
    setMode('idle');
  };

  const backToChoice = () => {
    stopCamera();
    setScanType(null);
    setMode('idle');
    setError('');
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

  // ── Step 1: choose scan type ──────────────────────────────────────
  if (!scanType) {
    return (
      <div className="fade-in">
        <div className="alert alert-info" style={{ marginBottom: '1.25rem' }}>
          <i className="ti ti-info-circle" />
          Choose how to identify this person. Scans are checked against records from every station.
        </div>

        <div className="scan-choice-grid">
          <div className="scan-choice-card" onClick={() => setScanType('face')}>
            <div className="scan-choice-icon"><i className="ti ti-face-id" /></div>
            <div className="scan-choice-title">Face scan</div>
            <div className="scan-choice-sub">Camera or uploaded photo. Works on any device.</div>
          </div>

          <div
            className={`scan-choice-card ${!fingerprintAvailable ? 'disabled' : ''}`}
            onClick={() => fingerprintAvailable && setScanType('fingerprint')}
          >
            <div className="scan-choice-icon"><i className="ti ti-fingerprint" /></div>
            <div className="scan-choice-title">Fingerprint scan</div>
            <div className="scan-choice-sub">
              {fingerprintAvailable
                ? 'Upload a scan from a connected USB fingerprint device.'
                : 'Needs a USB scanner — not available on phones.'}
            </div>
          </div>
        </div>

        <button className="btn btn-ghost" style={{ marginTop: '1.25rem' }} onClick={onSkip}>
          <i className="ti ti-pencil" /> Skip — enter details manually
        </button>
      </div>
    );
  }

  // ── Fingerprint flow ────────────────────────────────────────────────
  if (scanType === 'fingerprint') {
    return (
      <div className="fade-in">
        <button className="btn btn-ghost btn-sm" style={{ marginBottom: '1rem' }} onClick={backToChoice}>
          <i className="ti ti-arrow-left" /> Choose a different method
        </button>

        <div className="alert alert-warn" style={{ marginBottom: '1.25rem' }}>
          <i className="ti ti-alert-triangle" />
          Fingerprint matching against other records isn't available yet — this scan is stored
          on file for reference once the offender is identified or a new record is created.
        </div>

        {fingerprintPreview ? (
          <div className="fade-in">
            <div className="scan-frame" style={{ maxWidth: 220 }}>
              <img src={fingerprintPreview} alt="Fingerprint scan" />
            </div>
            <div style={{ marginTop: '1rem', maxWidth: 260 }}>
              <label style={{ display: 'block', marginBottom: '0.4rem' }}>Finger</label>
              <select value={fingerPosition} onChange={e => setFingerPosition(e.target.value)}>
                {FINGER_POSITIONS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem', flexWrap: 'wrap' }}>
              <button className="btn btn-primary" onClick={onSkip}>
                <i className="ti ti-arrow-right" /> Continue to booking
              </button>
              <button className="btn btn-ghost" onClick={() => { setFingerprintFile(null); setFingerprintPreview(null); }}>
                <i className="ti ti-refresh" /> Retake
              </button>
            </div>
          </div>
        ) : (
          <label className="scan-upload-zone">
            <i className="ti ti-fingerprint" />
            <span className="label">Upload fingerprint scan</span>
            <span className="hint">Scan with your station's device, then upload the saved image here</span>
            <input type="file" accept="image/*" onChange={handleFingerprintUpload} style={{ display: 'none' }} />
          </label>
        )}
      </div>
    );
  }

  // ── Face flow ───────────────────────────────────────────────────────
  return (
    <div className="fade-in">
      <button className="btn btn-ghost btn-sm" style={{ marginBottom: '1rem' }} onClick={backToChoice}>
        <i className="ti ti-arrow-left" /> Choose a different method
      </button>

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
          </div>
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
            <button className="btn btn-ghost" onClick={resetFace}><i className="ti ti-refresh" /> Retake</button>
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
                <button className="btn btn-ghost" onClick={resetFace}><i className="ti ti-refresh" /> Retake</button>
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
                <button className="btn btn-ghost" onClick={resetFace}><i className="ti ti-refresh" /> Retake</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
});

export default BiometricCapture;
