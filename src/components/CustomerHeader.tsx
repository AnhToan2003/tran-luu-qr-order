import React from 'react';

interface CustomerHeaderProps {
  onOpenMyOrders: () => void;
  hasActiveOrder: boolean;
  isAcceptingOrders?: boolean;
  courtDisabledMessage?: string | null;
}

export const CustomerHeader: React.FC<CustomerHeaderProps> = ({
  onOpenMyOrders,
  hasActiveOrder,
  isAcceptingOrders = true,
  courtDisabledMessage = null
}) => {
  const isAvailable = isAcceptingOrders && !courtDisabledMessage;
  const statusLabel = courtDisabledMessage
    ? 'Sân tạm dừng nhận đơn'
    : !isAcceptingOrders
    ? 'Quầy đang tạm dừng nhận đơn'
    : 'Quầy nước đang mở nhận đơn';
  const dotColor = isAvailable ? 'var(--color-primary, #10B981)' : '#EF4444';
  const textColor = isAvailable ? 'var(--color-text-muted)' : '#DC2626';

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
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{
          width: '50px',
          height: '50px',
          borderRadius: '50%',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: '2.5px solid var(--color-primary, #10B981)',
          boxShadow: '0 2px 10px rgba(16, 185, 129, 0.35)',
          backgroundColor: '#09251B',
          flexShrink: 0
        }}>
          <img
            src="/images/logo.jpg"
            alt="Sân Cầu Lông Trần Lựu"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              transform: 'scale(1.3)',
              display: 'block'
            }}
          />
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
            color: textColor,
            fontWeight: isAvailable ? 500 : 700,
            marginTop: '2px',
            transition: 'all 0.2s ease'
          }}>
            <span style={{
              display: 'inline-block',
              width: '7px',
              height: '7px',
              borderRadius: '50%',
              backgroundColor: dotColor,
              boxShadow: isAvailable ? '0 0 6px rgba(16, 185, 129, 0.4)' : '0 0 6px rgba(239, 68, 68, 0.4)'
            }} />
            {statusLabel}
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
