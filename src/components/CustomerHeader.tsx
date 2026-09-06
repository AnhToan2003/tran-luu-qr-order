import React from 'react';

interface CustomerHeaderProps {
  onOpenMyOrders: () => void;
  hasActiveOrder: boolean;
}

export const CustomerHeader: React.FC<CustomerHeaderProps> = ({
  onOpenMyOrders,
  hasActiveOrder
}) => {
  return (
    <header style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '12px 16px',
      backgroundColor: 'var(--color-surface)',
      borderBottom: '1px solid var(--color-border)',
      position: 'sticky',
      top: 0,
      zIndex: 40
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{
          width: '36px',
          height: '36px',
          borderRadius: 'var(--radius-md)',
          backgroundColor: 'var(--color-deep)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--color-accent)',
          fontWeight: 800,
          fontSize: '18px',
          boxShadow: 'var(--shadow-sm)'
        }}>
          TL
        </div>
        <div>
          <div style={{
            fontSize: 'var(--font-size-base)',
            fontWeight: 700,
            color: 'var(--color-deep)',
            letterSpacing: '-0.2px',
            lineHeight: 1.2
          }}>
            Sân Cầu Lông Trần Lựu
          </div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: 'var(--font-size-xs)',
            color: 'var(--color-text-muted)',
            marginTop: '2px'
          }}>
            <span style={{
              display: 'inline-block',
              width: '7px',
              height: '7px',
              borderRadius: '50%',
              backgroundColor: 'var(--color-primary)'
            }} />
            Quầy nước đang mở nhận đơn
          </div>
        </div>
      </div>

      <button
        onClick={onOpenMyOrders}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '8px 12px',
          borderRadius: 'var(--radius-md)',
          backgroundColor: hasActiveOrder ? 'var(--color-primary-light)' : 'var(--color-bg)',
          border: `1px solid ${hasActiveOrder ? 'var(--color-primary)' : 'var(--color-border)'}`,
          color: hasActiveOrder ? 'var(--color-primary)' : 'var(--color-text-main)',
          fontSize: 'var(--font-size-sm)',
          fontWeight: 600,
          transition: 'var(--transition-fast)'
        }}
      >
        <span>Đơn của bạn</span>
        {hasActiveOrder && (
          <span style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: 'var(--color-status-urgent)',
            animation: 'pulseGlow 1.5s infinite'
          }} />
        )}
      </button>
    </header>
  );
};
