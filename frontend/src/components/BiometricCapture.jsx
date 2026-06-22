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
 * driver exposing it as a standard image-capture device (most police
 * scanners, e.g. Futronic, SecuGen, work this way) — the officer scans
 * via the scanner's own capture software, then uploads the resulting
 * image file here, the same as uploading a photo.
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
      setError('Could not access camera. You can upload a photo instead.');
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

  /**
   * Fingerprint has no matching engine yet, so it can't drive the
   * search the way face capture does. Instead: stash the file, let the
   * officer proceed via face/manual/skip, and attach the fingerprint
   * to whichever Offender record that path resolves to. The parent
   * (BookingModal) calls this once an offenderId exists.
   */
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
      // Non-fatal — booking proceeds even if the fingerprint image fails to save
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
    <div className="card" style={{ padding: '1rem', marginTop: '1rem', background: 'var(--bg-secondary, #f8f9fa)' }}>
      <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Fingerprint scan (optional)</div>
      <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
        Scan with your station's fingerprint device, then upload the saved image here.
        Fingerprint matching against other records isn't available yet — this scan is stored
        on file for visual reference once an offender record is created or matched by face.
      </div>
      {fingerprintPreview ? (
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <img src={fingerprintPreview} alt="Fingerprint scan" style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }} />
          <div style={{ flex: 1 }}>
            <select className="form-control" value={fingerPosition} onChange={e => setFingerPosition(e.target.value)} style={{ marginBottom: '0.5rem' }}>
              {FINGER_POSITIONS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
            <button className="btn btn-ghost btn-sm" onClick={() => { setFingerprintFile(null); setFingerprintPreview(null); }}>Remove</button>
          </div>
        </div>
      ) : (
        <label className="btn btn-ghost" style={{ cursor: 'pointer' }}>
          🖐️ Upload fingerprint scan
          <input type="file" accept="image/*" onChange={handleFingerprintUpload} style={{ display: 'none' }} />
        </label>
      )}
    </div>
  );

  return (
    <div>
      <div className="alert alert-info" style={{ marginBottom: '1rem' }}>
        Scan the offender's face and/or fingerprint to check if they've already been booked
        at any station. This step is optional but recommended.
      </div>

      {error && <div className="alert alert-error" style={{ marginBottom: '1rem' }}>{error}</div>}

      {mode === 'idle' && !photoPreview && (
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={startCamera}>📷 Use camera</button>
          <label className="btn btn-ghost" style={{ cursor: 'pointer' }}>
            🖼️ Upload photo
            <input type="file" accept="image/*" onChange={handleFileUpload} style={{ display: 'none' }} />
          </label>
          <button className="btn btn-ghost" onClick={onSkip}>Skip — enter details manually</button>
        </div>
      )}

      {mode === 'idle' && !photoPreview && <FingerprintPanel />}

      {mode === 'camera' && (
        <div>
          <video ref={videoRef} autoPlay playsInline style={{ width: '100%', maxWidth: 480, borderRadius: 8, background: '#000' }} />
          <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
            <button className="btn btn-primary" onClick={capturePhoto}>Capture</button>
            <button className="btn btn-ghost" onClick={() => { stopCamera(); setMode('idle'); }}>Cancel</button>
          </div>
        </div>
      )}

      {mode === 'idle' && photoPreview && (
        <div>
          <img src={photoPreview} alt="Captured" style={{ width: 200, borderRadius: 8, marginBottom: '1rem' }} />
          <div style={{ display: 'flex', gap: '1rem' }}>
            <button className="btn btn-primary" onClick={runSearch}>🔍 Search all stations</button>
            <button className="btn btn-ghost" onClick={reset}>Retake</button>
          </div>
        </div>
      )}

      {mode === 'searching' && (
        <div style={{ textAlign: 'center', padding: '2rem' }}>
          <div>🔄 Searching biometric records across all stations...</div>
        </div>
      )}

      {mode === 'result' && searchResult && (
        <div>
          <img src={photoPreview} alt="Captured" style={{ width: 150, borderRadius: 8, marginBottom: '1rem' }} />

          {searchResult.match ? (
            <div>
              <div className="alert" style={{ background: 'var(--amber-bg, #fff7e6)', border: '1px solid var(--amber, #d97706)', marginBottom: '1rem' }}>
                <strong>⚠️ Possible match found</strong> — {Math.round(searchResult.match.confidence * 100)}% confidence
              </div>
              <div className="card" style={{ padding: '1rem', marginBottom: '1rem' }}>
                <div style={{ fontSize: '1.1rem', fontWeight: 600 }}>
                  {searchResult.match.offender.firstName} {searchResult.match.offender.lastName}
                  {searchResult.match.offender.alias && <span style={{ color: 'var(--text-muted)' }}> ({searchResult.match.offender.alias})</span>}
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '0.25rem' }}>
                  Offender No: {searchResult.match.offender.offenderNumber}
                </div>
                <div style={{ marginTop: '0.5rem' }}>
                  Prior bookings: <strong>{searchResult.match.priorBookingsCount}</strong>
                  {searchResult.match.priorStations.length > 0 && (
                    <> across <strong>{searchResult.match.priorStations.join(', ')}</strong></>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                <button className="btn btn-primary" onClick={() => onMatchFound(searchResult.match.offender, searchResult.match.confidence)}>
                  ✓ Yes, this is the same person — add new offense
                </button>
                <button className="btn btn-ghost" onClick={() => onNoMatch(searchResult.descriptor, searchResult.photoBuffer, photoPreview)}>
                  Not a match — create new offender record
                </button>
                <button className="btn btn-ghost" onClick={reset}>Retake photo</button>
              </div>
            </div>
          ) : (
            <div>
              <div className="alert alert-success" style={{ marginBottom: '1rem' }}>
                ✓ No existing record found — this will be a new offender.
              </div>
              <div style={{ display: 'flex', gap: '1rem' }}>
                <button className="btn btn-primary" onClick={() => onNoMatch(searchResult.descriptor, searchResult.photoBuffer, photoPreview)}>
                  Continue with new offender
                </button>
                <button className="btn btn-ghost" onClick={reset}>Retake photo</button>
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
