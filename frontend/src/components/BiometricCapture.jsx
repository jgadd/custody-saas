import { useState, useRef, useCallback } from 'react';
import api from '../lib/api';

/**
 * BiometricCapture
 *
 * Step 0 of the booking flow. Lets the officer take or upload a face
 * photo, searches it against every offender across all stations, and
 * reports back to the parent:
 *   - a confirmed match (existing offender + their booking history), or
 *   - "no match" along with the extracted descriptor + photo so a new
 *     Offender can be created without re-uploading the photo.
 *
 * Props:
 *   onMatchFound(offender)         — officer confirmed an existing match
 *   onNoMatch(descriptor, photoBase64, photoPreviewUrl) — proceed as new offender
 *   onSkip()                       — officer chooses to skip biometric capture entirely
 */
export default function BiometricCapture({ onMatchFound, onNoMatch, onSkip }) {
  const [mode, setMode] = useState('idle'); // idle | camera | searching | result
  const [photoPreview, setPhotoPreview] = useState(null);
  const [photoFile, setPhotoFile] = useState(null);
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

  const reset = () => {
    setPhotoFile(null);
    setPhotoPreview(null);
    setSearchResult(null);
    setError('');
    setMode('idle');
  };

  return (
    <div>
      <div className="alert alert-info" style={{ marginBottom: '1rem' }}>
        Capture a face photo to check if this person has already been booked at any station.
        This step is optional but recommended.
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
        </div>
      )}
    </div>
  );
}
