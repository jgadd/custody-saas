import { useState, useRef, useCallback, useEffect, forwardRef, useImperativeHandle } from 'react';
import api from '../lib/api';
import { supportsFingerprintCapture } from '../lib/device';
import { detectScanner, captureFingerprint, describeQuality } from '../lib/secugen';

/**
 * BiometricCapture
 *
 * Two purposes, controlled by the `purpose` prop:
 *
 *   purpose="check" (default) — "Check if known" landing step. Face
 *     capture runs a real search against every offender across all
 *     stations. Fingerprint has no matching engine yet, so it's
 *     informational only in this mode.
 *
 *   purpose="register" — used inside the booking form to capture a
 *     NEW offender's face/fingerprint for the first time. No search
 *     runs here — capturing just hands the descriptor/photo back to
 *     the parent via onRegistered() to attach to the new offender
 *     record on submission.
 *
 * Fingerprint capture works with any USB scanner exposing a standard
 * image-capture device, or a real-time SecuGen reader via lib/secugen.js.
 * Not offered on phones — see lib/device.js.
 *
 * Props:
 *   purpose                              — 'check' | 'register'
 *   onMatchFound(offender, confidence)   — (check) face match confirmed
 *   onNoMatch()                          — (check) no match, proceed to registration
 *   onSkip()                             — (check) skip the check entirely
 *   onRegistered(descriptor, photoBase64, fingerprintFile, fingerPosition) — (register) capture complete
 *
 * Ref:
 *   getPendingFingerprint() — returns the captured fingerprint as
 *   base64 (or null), for the parent to bundle into the single
 *   transactional booking request. Nothing is uploaded from here.
 */
const BiometricCapture = forwardRef(function BiometricCapture({ purpose = 'check', onMatchFound, onNoMatch, onSkip, onRegistered }, ref) {
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
  const [scannerStatus, setScannerStatus] = useState('checking'); // checking | found | not-found
  const [scannerInfo, setScannerInfo] = useState(null);
  const [scanningFingerprint, setScanningFingerprint] = useState(false);
  const [fingerprintQuality, setFingerprintQuality] = useState(null);

  useEffect(() => {
    if (scanType !== 'fingerprint' || !fingerprintAvailable) return;
    setScannerStatus('checking');
    detectScanner().then(info => {
      if (info) {
        setScannerInfo(info);
        setScannerStatus('found');
      } else {
        setScannerStatus('not-found');
      }
    });
  }, [scanType, fingerprintAvailable]);

  const handleLiveCapture = async () => {
    setScanningFingerprint(true);
    setError('');
    try {
      const result = await captureFingerprint();
      setFingerprintPreview(`data:image/bmp;base64,${result.imageBase64}`);
      // Convert the base64 BMP into a File so it flows through the same
      // upload/submission path as a manually-selected file.
      const byteString = atob(result.imageBase64);
      const bytes = new Uint8Array(byteString.length);
      for (let i = 0; i < byteString.length; i++) bytes[i] = byteString.charCodeAt(i);
      setFingerprintFile(new File([bytes], 'fingerprint.bmp', { type: 'image/bmp' }));
      setFingerprintQuality(describeQuality(result.nfiq));
    } catch (e) {
      setError(e.message || 'Fingerprint capture failed. Please try again.');
    } finally {
      setScanningFingerprint(false);
    }
  };

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

  /**
   * Returns the captured fingerprint as base64, for the parent
   * (BookingModal) to bundle into the single transactional booking
   * request — nothing is uploaded or written to disk from here. This
   * keeps biometric data out of the database entirely unless the
   * booking itself is actually confirmed.
   */
  const getPendingFingerprint = async () => {
    if (!fingerprintFile) return null;
    const buffer = await fingerprintFile.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
    return {
      buffer: base64,
      mimetype: fingerprintFile.type || 'image/jpeg',
      fingerPosition,
    };
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

  /**
   * Register mode still calls /face/search — not to check for a match
   * (the officer already decided to register fresh, possibly after a
   * "check if known" scan already came back with no match), but
   * because that's the only place a real face descriptor gets
   * extracted from the photo. Without running this, the new offender
   * would have a photo on file but no descriptor, making them
   * unfindable by any future "check if known" scan. Any match result
   * is intentionally ignored here.
   */
  const confirmRegistration = async () => {
    if (!photoFile) {
      onRegistered?.(null, null);
      return;
    }
    setMode('searching');
    setError('');
    try {
      const formData = new FormData();
      formData.append('photo', photoFile, 'capture.jpg');
      const res = await api.post('/biometrics/face/search', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      onRegistered?.(res.data.descriptor, res.data.photoBuffer);
    } catch (e) {
      setError(e.response?.data?.error || 'Could not process the photo. You can retake it or continue without a face record.');
      setMode('idle');
    }
  };

  useImperativeHandle(ref, () => ({ getPendingFingerprint }));

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
          {purpose === 'register'
            ? "Capture this offender's face or fingerprint for their record."
            : 'Choose how to identify this person. Scans are checked against records from every station.'}
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
          <i className="ti ti-pencil" />
          {purpose === 'register' ? ' Skip — no biometric record' : ' Skip — enter details manually'}
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

        {!fingerprintPreview && scannerStatus === 'checking' && (
          <div className="scan-pulse">
            <div className="scan-pulse-ring" />
            <div className="scan-pulse-text">Checking for a connected fingerprint scanner…</div>
          </div>
        )}

        {!fingerprintPreview && scannerStatus === 'found' && (
          <div className="fade-in">
            <div className="alert alert-success" style={{ marginBottom: '1rem' }}>
              <i className="ti ti-circle-check" /> Scanner connected — {scannerInfo?.model || 'reader detected'}
            </div>
            <div className="scan-upload-zone" onClick={!scanningFingerprint ? handleLiveCapture : undefined} style={{ cursor: scanningFingerprint ? 'default' : 'pointer' }}>
              {scanningFingerprint ? (
                <>
                  <div className="scan-pulse-ring" style={{ width: 40, height: 40 }} />
                  <span className="label">Place finger on the scanner…</span>
                </>
              ) : (
                <>
                  <i className="ti ti-fingerprint" />
                  <span className="label">Tap to scan</span>
                  <span className="hint">Place the offender's finger on the connected reader</span>
                </>
              )}
            </div>
          </div>
        )}

        {!fingerprintPreview && scannerStatus === 'not-found' && (
          <div className="fade-in">
            <div className="alert alert-info" style={{ marginBottom: '1rem' }}>
              <i className="ti ti-info-circle" />
              No connected scanner detected. If one is plugged in, make sure SecuGen's WebAPI
              service is running, then try again — or upload a scan saved from the device's own software.
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <button className="btn btn-ghost" onClick={() => { setScannerStatus('checking'); detectScanner().then(info => setScannerStatus(info ? 'found' : 'not-found')); }}>
                <i className="ti ti-refresh" /> Check again
              </button>
              <label className="btn btn-ghost" style={{ cursor: 'pointer' }}>
                <i className="ti ti-upload" /> Upload scan instead
                <input type="file" accept="image/*" onChange={handleFingerprintUpload} style={{ display: 'none' }} />
              </label>
            </div>
          </div>
        )}

        {fingerprintPreview ? (
          <div className="fade-in">
            <div className="scan-frame" style={{ maxWidth: 220 }}>
              <img src={fingerprintPreview} alt="Fingerprint scan" />
            </div>
            {fingerprintQuality && (
              <div className={`alert ${fingerprintQuality.level === 'good' ? 'alert-success' : 'alert-warn'}`} style={{ marginTop: '0.75rem', maxWidth: 260 }}>
                <i className="ti ti-gauge" /> Scan quality: {fingerprintQuality.label}
              </div>
            )}
            <div style={{ marginTop: '1rem', maxWidth: 260 }}>
              <label style={{ display: 'block', marginBottom: '0.4rem' }}>Finger</label>
              <select value={fingerPosition} onChange={e => setFingerPosition(e.target.value)}>
                {FINGER_POSITIONS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem', flexWrap: 'wrap' }}>
              <button className="btn btn-primary" onClick={onSkip}>
                <i className="ti ti-arrow-right" /> {purpose === 'register' ? 'Done' : 'Continue to booking'}
              </button>
              <button className="btn btn-ghost" onClick={() => { setFingerprintFile(null); setFingerprintPreview(null); setFingerprintQuality(null); }}>
                <i className="ti ti-refresh" /> Retake
              </button>
            </div>
          </div>
        ) : null}
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
            {purpose === 'register' ? (
              <button className="btn btn-primary" onClick={confirmRegistration}><i className="ti ti-check" /> Use this photo</button>
            ) : (
              <button className="btn btn-primary" onClick={runSearch}><i className="ti ti-search" /> Search all stations</button>
            )}
            <button className="btn btn-ghost" onClick={resetFace}><i className="ti ti-refresh" /> Retake</button>
          </div>
        </div>
      )}

      {mode === 'searching' && (
        <div className="scan-pulse fade-in">
          <div className="scan-pulse-ring" />
          <div className="scan-pulse-text">{purpose === 'register' ? 'Saving face record…' : 'Searching biometric records across all stations…'}</div>
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
