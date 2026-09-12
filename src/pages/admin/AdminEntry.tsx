import React, { lazy, Suspense, useEffect, useState } from 'react';
import { apiFetch } from '../../lib/api';
const Portal=lazy(()=>import('./AdminPortal').then(m=>({default:m.AdminPortal})));
export const AdminEntry: React.FC=()=>{
  const [state,setState]=useState<'loading'|'login'|'ready'>('loading');
  const [username,setUsername]=useState('admin');
  const [password,setPassword]=useState('');
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  useEffect(()=>{
    void fetch('/api/admin/auth/session').then(r=>setState(r.ok?'ready':'login')).catch(()=>{setState('login');setError('Không kết nối được máy chủ');});
    const expired=()=>{setState('login');setError('Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.');};
    window.addEventListener('admin-session-expired',expired);
    return ()=>window.removeEventListener('admin-session-expired',expired);
  },[]);
  if(state==='loading') return <p style={{padding:24}}>Đang kiểm tra phiên đăng nhập…</p>;
  if(state==='ready') return <Suspense fallback={<p>Đang tải quầy…</p>}><Portal /></Suspense>;
  return <main style={{minHeight:'100vh',display:'grid',placeItems:'center',background:'#E5EDE7',padding:20}}>
    <form onSubmit={async e=>{e.preventDefault();if(busy)return;setBusy(true);setError('');try{await apiFetch('/api/admin/auth/login',{method:'POST',body:JSON.stringify({username,password})});setPassword('');setState('ready');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}} style={{width:'100%',maxWidth:380,padding:28,background:'white',borderRadius:20,display:'grid',gap:16}}>
      <h1 style={{color:'#12432E',fontSize:24}}>Đăng nhập quầy nước</h1>
      <p>Sân Cầu Lông Trần Lựu</p>
      <label>Tên đăng nhập<input autoComplete="username" value={username} onChange={e=>setUsername(e.target.value)} required style={{display:'block',width:'100%',padding:12,border:'1px solid #ccc',borderRadius:8}} /></label>
      <label>Mật khẩu<input type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required style={{display:'block',width:'100%',padding:12,border:'1px solid #ccc',borderRadius:8}} /></label>
      {error&&<p role="alert" style={{color:'#b91c1c'}}>{error}</p>}
      <button disabled={busy} style={{padding:14,color:'white',background:'#137A49',borderRadius:8}}>{busy?'Đang đăng nhập…':'Đăng nhập'}</button>
      <a href="/order?court=05">Mở trang gọi nước</a>
    </form>
  </main>;
};
