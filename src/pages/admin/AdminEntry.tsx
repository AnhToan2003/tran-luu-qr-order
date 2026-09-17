import React, { lazy, Suspense, useEffect, useState } from 'react';
import { apiFetch } from '../../lib/api';
const Portal = lazy(() => import('./AdminPortal').then(m => ({ default: m.AdminPortal })));
export const AdminEntry: React.FC = () => {
  const [state, setState] = useState<'loading' | 'login' | 'ready'>('loading');
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    fetch('/api/admin/auth/session', { signal: controller.signal })
      .then(r => setState(r.ok ? 'ready' : 'login'))
      .catch(() => {
        setState('login');
        setError('Hãy Đăng Nhập VÀo Trang Quản Lí ');
      })
      .finally(() => clearTimeout(timeoutId));

    const expired = () => {
      setState('login');
      setError('Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.');
    };
    const loggedOut = () => {
      setState('login');
      setError('');
    };
    window.addEventListener('admin-session-expired', expired);
    window.addEventListener('admin-logged-out', loggedOut);
    return () => {
      clearTimeout(timeoutId);
      controller.abort();
      window.removeEventListener('admin-session-expired', expired);
      window.removeEventListener('admin-logged-out', loggedOut);
    };
  }, []);
  if (state === 'loading') return <p style={{ padding: 24 }}>Đang kiểm tra phiên đăng nhập…</p>;
  if (state === 'ready') return <Suspense fallback={<p>Đang tải quầy…</p>}><Portal /></Suspense>;
  return <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#E5EDE7', padding: 20 }}>
    <form onSubmit={async e => { e.preventDefault(); if (busy) return; setBusy(true); setError(''); try { await apiFetch('/api/admin/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }); setPassword(''); setState('ready'); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }} style={{ width: '100%', maxWidth: 380, padding: 28, background: 'white', borderRadius: 20, display: 'grid', gap: 16 }}>
      <div style={{ textAlign: 'center', marginBottom: '8px', display: 'flex', justifyContent: 'center' }}>
        <div style={{
          width: '100px',
          height: '100px',
          borderRadius: '50%',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: '3px solid #137A49',
          boxShadow: '0 6px 20px rgba(19, 122, 73, 0.35)',
          backgroundColor: '#09251B'
        }}>
          <img
            src="/images/logo.jpg"
            alt="Sân Cầu Lông Trần Lựu"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              transform: 'scale(1.3)',
              display: 'block'
            }}
          />
        </div>
      </div>
      <h1 style={{ color: '#12432E', fontSize: 24, margin: 0, textAlign: 'center' }}>Đăng nhập quầy nước</h1>
      <p style={{ margin: 0, textAlign: 'center', color: '#64748B', fontSize: '13px' }}>Sân Cầu Lông Trần Lựu</p>
      <label>Tên đăng nhập<input autoComplete="username" value={username} onChange={e => setUsername(e.target.value)} required style={{ display: 'block', width: '100%', padding: 12, border: '1px solid #ccc', borderRadius: 8 }} /></label>
      <label style={{ display: 'block' }}>
        Mật khẩu
        <div style={{ position: 'relative', width: '100%', marginTop: '4px' }}>
          <input
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            placeholder="Nhập mật khẩu"
            style={{
              display: 'block',
              width: '100%',
              padding: '12px 42px 12px 12px',
              border: '1px solid #ccc',
              borderRadius: 8,
              fontSize: 15,
              boxSizing: 'border-box'
            }}
          />
          <button
            type="button"
            onClick={() => setShowPassword(v => !v)}
            title={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
            aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
            style={{
              position: 'absolute',
              right: '8px',
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '6px',
              color: '#64748B',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            {showPassword ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            )}
          </button>
        </div>
      </label>
      {error && <p role="alert" style={{ color: '#b91c1c' }}>{error}</p>}
      <button disabled={busy} style={{ padding: 14, color: 'white', background: '#137A49', borderRadius: 8 }}>{busy ? 'Đang đăng nhập…' : 'Đăng nhập'}</button>
    </form>
  </main>;
};
