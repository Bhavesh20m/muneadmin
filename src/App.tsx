import React, { useState, useEffect } from 'react';
import { CustomerPortal } from './components/CustomerPortal';
import { AdminPortal } from './components/AdminPortal';
import { parseRoute } from './utils/pure_logic';
import { testConnection } from './firebase';

export default function App() {
  const [currentPath, setCurrentPath] = useState<string>(() => window.location.pathname);

  // Initialize and check Firestore connection on boot
  useEffect(() => {
    testConnection();
  }, []);

  // Listen to browser navigation (back/forward)
  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Handle URL canonicalization: if at root or bare /customer, direct to table 5 NFC destination
  useEffect(() => {
    const { portal } = parseRoute(currentPath);
    if (portal === 'customer' && !currentPath.includes('/customer/dineflow-demo/table/')) {
      const canonicalPath = '/customer/dineflow-demo/table/5';
      window.history.replaceState({}, '', canonicalPath);
      setCurrentPath(canonicalPath);
    }
  }, [currentPath]);

  const routeInfo = parseRoute(currentPath);

  const navigateToCustomer = (tableId: string = '5') => {
    const newPath = `/customer/dineflow-demo/table/${tableId}`;
    window.history.pushState({}, '', newPath);
    setCurrentPath(newPath);
  };

  const navigateToAdmin = () => {
    const newPath = '/admin/orders';
    window.history.pushState({}, '', newPath);
    setCurrentPath(newPath);
  };

  return (
    <div className="w-full min-h-screen">
      {routeInfo.portal === 'admin' ? (
        <AdminPortal onNavigateToCustomer={navigateToCustomer} />
      ) : (
        <CustomerPortal
          tableId={routeInfo.tableId || '5'}
          onNavigateToAdmin={navigateToAdmin}
        />
      )}
    </div>
  );
}
