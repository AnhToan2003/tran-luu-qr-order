import React from 'react';
import { COURTS } from '../types/order';

interface PrototypeNavProps {
  currentView: 'customer' | 'admin';
  onChangeView: (view: 'customer' | 'admin') => void;
  selectedCourtCode: string;
  onChangeCourt: (courtCode: string) => void;
  onResetDemo: () => void;
  onSeedSampleOrder: () => void;
}

export const PrototypeNav: React.FC<PrototypeNavProps> = ({
  currentView,
  onChangeView,
  selectedCourtCode,
  onChangeCourt,
  onResetDemo,
  onSeedSampleOrder
}) => {
  return (
    <div style={{
      backgroundColor: '#0A291C',
      color: '#FFFFFF',
      padding: '8px 16px',
      fontSize: 'var(--font-size-xs)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
      gap: '10px',
      borderBottom: '1px solid rgba(255, 255, 255, 0.15)',
      position: 'relative',
      zIndex: 200
    }}>
      {/* Left: Project title & Mode switcher */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{
          backgroundColor: 'var(--color-accent)',
          color: 'var(--color-accent-text)',
          fontWeight: 800,
          padding: '2px 8px',
          borderRadius: 'var(--radius-sm)',
          fontSize: '11px'
        }}>
          PROTOTYPE GIAI ĐOẠN 1
        </div>

        {/* View Switcher Pills */}
        <div style={{
          display: 'flex',
          backgroundColor: 'rgba(255, 255, 255, 0.1)',
          padding: '2px',
          borderRadius: 'var(--radius-md)',
          border: '1px solid rgba(255, 255, 255, 0.15)'
        }}>
          <button
            onClick={() => onChangeView('customer')}
            style={{
              padding: '6px 12px',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: currentView === 'customer' ? 'var(--color-primary)' : 'transparent',
              color: '#FFFFFF',
              fontWeight: currentView === 'customer' ? 800 : 500,
              fontSize: 'var(--font-size-xs)',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            <span>📱 Khách tại sân</span>
          </button>

          <button
            onClick={() => onChangeView('admin')}
            style={{
              padding: '6px 12px',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: currentView === 'admin' ? 'var(--color-primary)' : 'transparent',
              color: '#FFFFFF',
              fontWeight: currentView === 'admin' ? 800 : 500,
              fontSize: 'var(--font-size-xs)',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            <span>🖥️ Quầy điều hành</span>
          </button>
        </div>
      </div>

      {/* Right: Quick actions and court selector */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        {currentView === 'customer' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ color: '#A7C4B5', fontSize: '11px' }}>Chọn sân test QR:</span>
            <select
              value={selectedCourtCode}
              onChange={(e) => onChangeCourt(e.target.value)}
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.15)',
                color: 'var(--color-accent)',
                border: '1px solid rgba(255, 255, 255, 0.25)',
                borderRadius: 'var(--radius-sm)',
                padding: '4px 8px',
                fontSize: '12px',
                fontWeight: 700,
                outline: 'none'
              }}
            >
              {COURTS.map(c => (
                <option key={c.id} value={c.code} style={{ backgroundColor: '#0A291C', color: '#FFFFFF' }}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <button
          onClick={onSeedSampleOrder}
          style={{
            padding: '4px 10px',
            borderRadius: 'var(--radius-sm)',
            backgroundColor: 'rgba(213, 239, 118, 0.15)',
            color: 'var(--color-accent)',
            border: '1px solid var(--color-accent)',
            fontSize: '11px',
            fontWeight: 700
          }}
        >
          ➕ Tạo đơn mẫu
        </button>

        <button
          onClick={onResetDemo}
          style={{
            padding: '4px 8px',
            borderRadius: 'var(--radius-sm)',
            backgroundColor: 'transparent',
            color: '#B6D1BF',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            fontSize: '11px'
          }}
        >
          🔄 Đặt lại
        </button>
      </div>
    </div>
  );
};
