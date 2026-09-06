import React from 'react';
import { sound } from '../lib/sound';

interface AdminHeaderProps {
  isAcceptingOrders: boolean;
  onToggleAccepting: () => void;
  isSoundActive: boolean;
  onToggleSound: () => void;
  counts: {
    pendingConfirm: number; // < 60s
    needAccept: number;     // >= 60s
    preparing: number;
    delivered: number;
  };
}

export const AdminHeader: React.FC<AdminHeaderProps> = ({
  isAcceptingOrders,
  onToggleAccepting,
  isSoundActive,
  onToggleSound,
  counts
}) => {
  const handleTestSound = () => {
    sound.enableSound();
    sound.playOrderChime();
  };

  return (
    <header style={{
      backgroundColor: 'var(--color-deep)',
      color: '#FFFFFF',
      padding: '14px 20px',
      borderBottom: '2px solid var(--color-primary)',
      display: 'flex',
      flexDirection: 'column',
      gap: '12px'
    }}>
      {/* Top Row: Brand, Acceptance Toggle, Sound Buttons */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            backgroundColor: 'var(--color-accent)',
            color: 'var(--color-accent-text)',
            fontWeight: 900,
            fontSize: '18px',
            padding: '6px 12px',
            borderRadius: 'var(--radius-sm)'
          }}>
            QUẦY THU NGÂN
          </div>
          <div>
            <h1 style={{
              fontSize: 'var(--font-size-lg)',
              fontWeight: 800,
              letterSpacing: '-0.2px',
              margin: 0
            }}>
              Sân Cầu Lông Trần Lựu
            </h1>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: 'var(--font-size-xs)',
              color: '#B6D1BF',
              marginTop: '2px'
            }}>
              <span style={{
                display: 'inline-block',
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: isAcceptingOrders ? '#22C55E' : '#EF4444'
              }} />
              <span>{isAcceptingOrders ? 'Hệ thống đang mở nhận đơn' : 'Đang tạm dừng nhận đơn'}</span>
              <span>•</span>
              <span>16 Sân hoạt động</span>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {/* Sound Controls */}
          <button
            onClick={onToggleSound}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: isSoundActive ? 'var(--color-primary)' : 'rgba(255, 255, 255, 0.12)',
              color: '#FFFFFF',
              fontSize: 'var(--font-size-xs)',
              fontWeight: 700,
              border: '1px solid rgba(255, 255, 255, 0.2)'
            }}
          >
            <span>{isSoundActive ? '🔔 Đã bật chuông' : '🔕 Chưa bật chuông'}</span>
          </button>

          <button
            onClick={handleTestSound}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'rgba(255, 255, 255, 0.1)',
              color: 'var(--color-accent)',
              fontSize: 'var(--font-size-xs)',
              fontWeight: 700,
              border: '1px solid var(--color-accent)'
            }}
          >
            <span>🎵 Thử chuông</span>
          </button>

          {/* Toggle Acceptance */}
          <button
            onClick={onToggleAccepting}
            style={{
              padding: '8px 16px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: isAcceptingOrders ? 'rgba(239, 68, 68, 0.2)' : 'rgba(34, 197, 94, 0.2)',
              color: isAcceptingOrders ? '#FCA5A5' : '#86EFAC',
              border: `1px solid ${isAcceptingOrders ? '#EF4444' : '#22C55E'}`,
              fontSize: 'var(--font-size-xs)',
              fontWeight: 700
            }}
          >
            {isAcceptingOrders ? 'Tắt nhận đơn' : 'Bật nhận đơn'}
          </button>
        </div>
      </div>

      {/* Bottom KPI Bar: 4 Column Counters */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
        gap: '10px',
        paddingTop: '8px',
        borderTop: '1px solid rgba(255, 255, 255, 0.1)'
      }}>
        {/* Pending <60s */}
        <div style={{
          backgroundColor: 'rgba(255, 255, 255, 0.06)',
          padding: '8px 12px',
          borderRadius: 'var(--radius-sm)',
          borderLeft: '3px solid var(--color-status-new)'
        }}>
          <div style={{ fontSize: '11px', color: '#B6D1BF', textTransform: 'uppercase' }}>Chờ xác nhận (&lt;60s)</div>
          <div style={{ fontSize: 'var(--font-size-lg)', fontWeight: 800, color: 'var(--color-accent)' }}>
            {counts.pendingConfirm} đơn
          </div>
        </div>

        {/* Need Accept >= 60s */}
        <div style={{
          backgroundColor: counts.needAccept > 0 ? 'rgba(220, 38, 38, 0.2)' : 'rgba(255, 255, 255, 0.06)',
          padding: '8px 12px',
          borderRadius: 'var(--radius-sm)',
          borderLeft: '3px solid #EF4444',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <div style={{ fontSize: '11px', color: '#FCA5A5', textTransform: 'uppercase', fontWeight: 700 }}>
              CẦN NHẬN NGAY
            </div>
            <div style={{ fontSize: 'var(--font-size-lg)', fontWeight: 900, color: '#FFFFFF' }}>
              {counts.needAccept} đơn
            </div>
          </div>
          {counts.needAccept > 0 && (
            <span className="animate-chime" style={{ fontSize: '20px' }}>
              🔔
            </span>
          )}
        </div>

        {/* Preparing */}
        <div style={{
          backgroundColor: 'rgba(255, 255, 255, 0.06)',
          padding: '8px 12px',
          borderRadius: 'var(--radius-sm)',
          borderLeft: '3px solid #3B82F6'
        }}>
          <div style={{ fontSize: '11px', color: '#B6D1BF', textTransform: 'uppercase' }}>Đang chuẩn bị</div>
          <div style={{ fontSize: 'var(--font-size-lg)', fontWeight: 800, color: '#93C5FD' }}>
            {counts.preparing} đơn
          </div>
        </div>

        {/* Delivered & Paid */}
        <div style={{
          backgroundColor: 'rgba(255, 255, 255, 0.06)',
          padding: '8px 12px',
          borderRadius: 'var(--radius-sm)',
          borderLeft: '3px solid #22C55E'
        }}>
          <div style={{ fontSize: '11px', color: '#B6D1BF', textTransform: 'uppercase' }}>Đã giao & thu tiền</div>
          <div style={{ fontSize: 'var(--font-size-lg)', fontWeight: 800, color: '#86EFAC' }}>
            {counts.delivered} đơn
          </div>
        </div>
      </div>
    </header>
  );
};
