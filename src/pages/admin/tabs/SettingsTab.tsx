import React from 'react';
import { sound } from '../../../lib/sound';

interface SettingsTabProps {
  isAcceptingOrders: boolean;
  onToggleAcceptingOrders: () => void;
}

export const SettingsTab: React.FC<SettingsTabProps> = ({
  isAcceptingOrders,
  onToggleAcceptingOrders,
}) => {
  return (
    <div style={{ padding: '24px', maxWidth: '800px', margin: '0 auto' }}>
      <h2 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 800, color: 'var(--color-deep)', marginBottom: '16px' }}>
        Cài Đặt Hệ Thống Vận Hành
      </h2>

      <div style={{ backgroundColor: 'var(--color-surface)', padding: '20px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Accepting orders */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '16px', borderBottom: '1px solid var(--color-border)' }}>
          <div>
            <div style={{ fontWeight: 800, color: 'var(--color-deep)' }}>Công tắc nhận đơn toàn sân</div>
          </div>
          <button
            onClick={onToggleAcceptingOrders}
            style={{
              padding: '8px 18px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: isAcceptingOrders ? 'var(--color-primary)' : '#EF4444',
              color: '#FFFFFF',
              fontWeight: 700,
              fontSize: 'var(--font-size-sm)',
              border: 'none',
              cursor: 'pointer'
            }}
          >
            {isAcceptingOrders ? 'ĐANG MỞ' : 'TẠM TẮT'}
          </button>
        </div>

        {/* Sound test */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: 800, color: 'var(--color-deep)' }}>Âm thanh chuông báo quầy</div>
          </div>
          <button
            onClick={() => {
              sound.enableSound();
              sound.playOrderChime();
            }}
            style={{
              padding: '8px 16px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--color-bg)',
              border: '1px solid var(--color-border)',
              fontWeight: 700,
              fontSize: 'var(--font-size-sm)',
              cursor: 'pointer'
            }}
          >
            🎵 Thử chuông
          </button>
        </div>
      </div>
    </div>
  );
};