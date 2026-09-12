import React, { useState, useEffect, lazy, Suspense } from 'react';
import { CustomerOrderPage } from './pages/CustomerOrderPage';
const AdminEntry=lazy(()=>import('./pages/admin/AdminEntry').then(m=>({default:m.AdminEntry})));

export const App: React.FC = () => {
  const [currentPath, setCurrentPath] = useState<string>(() => window.location.pathname);

  useEffect(() => {
    const handleLocationChange = () => {
      setCurrentPath(window.location.pathname);
    };

    window.addEventListener('popstate', handleLocationChange);
    return () => window.removeEventListener('popstate', handleLocationChange);
  }, []);

  // Luồng 1: Admin Portal (/admin)
  if (currentPath.startsWith('/admin')) {
    return <Suspense fallback={<p>Đang tải…</p>}><AdminEntry /></Suspense>;
  }

  // Luồng 2: Khách hàng tại sân (/ hoặc /order)
  return <CustomerOrderPage />;
};
