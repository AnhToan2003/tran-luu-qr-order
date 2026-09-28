import React, { useState, useEffect, lazy, Suspense } from 'react';
import { CustomerOrderPage } from './pages/CustomerOrderPage';
import { GlobalActionProofModal, GlobalSuccessToast } from './components';
const AdminEntry = lazy(() => import('./pages/admin/AdminEntry').then(m => ({ default: m.AdminEntry })));

export const App: React.FC = () => {
  const [currentPath, setCurrentPath] = useState<string>(() => window.location.pathname);

  useEffect(() => {
    const handleLocationChange = () => {
      setCurrentPath(window.location.pathname);
    };

    window.addEventListener('popstate', handleLocationChange);
    return () => window.removeEventListener('popstate', handleLocationChange);
  }, []);

  return (
    <>
      {currentPath.startsWith('/admin') ? (
        <Suspense fallback={<p>Đang tải…</p>}>
          <AdminEntry />
        </Suspense>
      ) : (
        <CustomerOrderPage />
      )}
      <GlobalActionProofModal />
      <GlobalSuccessToast />
    </>
  );
};

