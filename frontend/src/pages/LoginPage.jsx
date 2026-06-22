import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '../store/authStore';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { login, loading, error } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async e => {
    e.preventDefault();
    try {
      await login(email, password);
      navigate('/');
    } catch {}
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="card" style={{ padding: '2rem' }}>
          <div className="login-header">
            <img src="/rpngc-crest.png" alt="RPNGC Emblem" style={{ width: 64, height: 'auto', marginBottom: '0.5rem' }} />
            <h1>RPNGC Custody System</h1>
            <div className="login-divider" />
            <p>Royal Papua New Guinea Constabulary</p>
            <p style={{ marginTop: '0.25rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Authorised personnel only
            </p>
          </div>

          {error && <div className="alert alert-error" style={{ marginBottom: '1rem' }}>⚠️ {error}</div>}

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Email Address</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="officer@station.police.gov.pg" required autoFocus />
            </div>
            <div className="form-group">
              <label>Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                placeholder="••••••••" required />
            </div>
            <button type="submit" className="btn btn-primary btn-lg" style={{ width: '100%', marginTop: '0.5rem' }} disabled={loading}>
              {loading ? '🔄 Signing in...' : '🔐 Sign In'}
            </button>
          </form>

          <div style={{ marginTop: '1.5rem', padding: '1rem', background: 'var(--navy-700)', borderRadius: '6px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            <strong style={{ color: 'var(--gold)' }}>Demo Accounts:</strong><br/>
            Super Admin: superadmin@custody.gov.pg / admin123<br/>
            Station Admin: admin@boroko.police.gov.pg / boroko123<br/>
            Officer: officer@boroko.police.gov.pg / officer123
          </div>
        </div>
        <div style={{ textAlign: 'center', marginTop: '1rem', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
          © {new Date().getFullYear()} Royal Papua New Guinea Constabulary. All rights reserved.
        </div>
      </div>
    </div>
  );
}
