import React, { useState, useEffect } from 'react';
import { CustomerOrderPage } from './pages/CustomerOrderPage';
import { AdminPortal } from './pages/admin/AdminPortal';

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
    return <AdminPortal />;
  }

  // Luồng 2: Khách hàng tại sân (/ hoặc /order)
  return <CustomerOrderPage />;
};
