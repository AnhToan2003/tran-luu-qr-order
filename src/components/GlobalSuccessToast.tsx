import React, { useState, useEffect, useCallback, useRef } from 'react';

interface ToastItem {
  id: number;
  message: string;
  visible: boolean;
}

let nextId = 1;

export const GlobalSuccessToast: React.FC = () => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const removeToast = useCallback((id: number) => {
    setToasts(prev => prev.map(t => t.id === id ? { ...t, visible: false } : t));
    const timer = setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 300);
    timersRef.current.set(id, timer);
  }, []);

  const addToast = useCallback((message: string) => {
    const id = nextId++;
    setToasts(prev => [...prev, { id, message, visible: true }]);

    const fadeTimer = setTimeout(() => removeToast(id), 3500);
    timersRef.current.set(id * 1000, fadeTimer);
  }, [removeToast]);

  useEffect(() => {
    const timers = timersRef.current;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (typeof detail === 'string' && detail) {
        addToast(detail);
      }
    };
    window.addEventListener('api-action-success', handler);
    return () => {
      window.removeEventListener('api-action-success', handler);
      timers.forEach(t => clearTimeout(t));
    };
  }, [addToast]);

  if (toasts.length === 0) return null;

  return (
    <div style={{
      position: 'fixed',
      top: '20px',
      right: '20px',
      zIndex: 999999,
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
      pointerEvents: 'none'
    }}>
      {toasts.map(t => (
        <div
          key={t.id}
          style={{
            padding: '14px 20px',
            borderRadius: '12px',
            backgroundColor: '#ECFDF5',
            border: '1.5px solid #86EFAC',
            color: '#065F46',
            fontSize: '14px',
            fontWeight: 700,
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.12)',
            pointerEvents: 'auto',
            opacity: t.visible ? 1 : 0,
            transform: t.visible ? 'translateX(0)' : 'translateX(40px)',
            transition: 'opacity 0.3s ease, transform 0.3s ease',
            maxWidth: '420px',
            lineHeight: 1.4,
            cursor: 'pointer'
          }}
          onClick={() => removeToast(t.id)}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
};
