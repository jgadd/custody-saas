import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import useAuthStore from '../store/authStore';

export default function SetPasswordPage() {
  const { user, setUser } = useAuthStore();
  const navigate = useNavigate();
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirm) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await api.post('/auth/change-password', { newPassword });
      // Clear the mustChangePassword flag locally
      setUser({ ...user, mustChangePassword: false });
      navigate('/');
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to set password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', background: 'var(--navy-900)'
    }}>
      <div className="card" style={{ width: '100%', maxWidth: 420, padding: '2rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <i className="ti ti-lock-open" style={{ fontSize: '2.5rem', color: 'var(--gold)' }} />
          <h2 style={{ marginTop: '0.5rem', color: 'var(--navy)' }}>Set Your Password</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '0.5rem' }}>
            Welcome, <strong>{user?.name}</strong>. Your account was created by an admin.
            Please set a new password before continuing.
          </p>
        </div>

        {error && (
          <div className="alert alert-error" style={{ marginBottom: '1rem' }}>
            <i className="ti ti-alert-triangle" /> {error}
          </div>
        )}

        <div className="form-group">
          <label>New Password</label>
          <input
            type="password"
            value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
            placeholder="At least 8 characters"
            autoFocus
          />
        </div>
        <div className="form-group">
          <label>Confirm Password</label>
          <input
            type="password"
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            placeholder="Repeat your new password"
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          />
        </div>

        <button
          className="btn btn-primary"
          style={{ width: '100%', marginTop: '1rem' }}
          onClick={handleSubmit}
          disabled={loading}
        >
          {loading
            ? <><i className="ti ti-loader-2" /> Setting password…</>
            : <><i className="ti ti-check" /> Set Password & Continue</>
          }
        </button>
      </div>
    </div>
  );
}
