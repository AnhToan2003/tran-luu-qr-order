import React from 'react';

interface CustomerHeaderProps {
  onOpenMyOrders: () => void;
  hasActiveOrder: boolean;
  isStatusLoading?: boolean;
  isAcceptingOrders?: boolean;
  courtDisabledMessage?: string | null;
}

export const CustomerHeader: React.FC<CustomerHeaderProps> = ({
  onOpenMyOrders,
  hasActiveOrder,
  isStatusLoading = false,
  isAcceptingOrders = true,
  courtDisabledMessage = null
}) => {
  const isAvailable = isAcceptingOrders && !courtDisabledMessage;
  const statusLabel = isStatusLoading
    ? ''
    : courtDisabledMessage
    ? 'Sân tạm dừng'
    : !isAcceptingOrders
    ? 'Quầy tạm dừng'
    : 'Đang mở nhận đơn';
  const dotColor = isAvailable ? '#10B981' : '#EF4444';
  const textColor = isAvailable ? '#334155' : '#DC2626';

  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 16px',
        backgroundColor: 'rgba(255, 255, 255, 0.94)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderBottom: '1px solid rgba(226, 233, 226, 0.85)',
        position: 'sticky',
        top: 0,
        zIndex: 40,
        transition: 'background-color 0.2s ease, box-shadow 0.2s ease',
        boxShadow: '0 2px 10px rgba(18, 67, 46, 0.04)'
      }}
    >
      <style>{`
        @keyframes headerDotGlow {
          0%, 100% {
            opacity: 1;
            transform: scale(1);
          }
          50% {
            opacity: 0.6;
            transform: scale(1.15);
          }
        }
      `}</style>

      {/* Brand & Logo Section */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '11px', minWidth: 0 }}>
        <div
          style={{
            width: '46px',
            height: '46px',
            borderRadius: '50%',
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '2px solid #137A49',
            boxShadow: '0 2px 8px rgba(19, 122, 73, 0.25)',
            backgroundColor: '#09251B',
            flexShrink: 0
          }}
        >
          <img
            src="/images/logo.jpg"
            alt="Sân Cầu Lông Trần Lựu"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              transform: 'scale(1.25)',
              display: 'block'
            }}
          />
        </div>

        <div style={{ minWidth: 0 }}>
          {!isStatusLoading && (
            <div
              style={{
                fontSize: '15px',
                fontWeight: 800,
                color: '#12432E',
                letterSpacing: '-0.2px',
                lineHeight: 1.25,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}
            >
              Sân Cầu Lông Trần Lựu
            </div>
          )}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '12px',
              color: textColor,
              fontWeight: isAvailable ? 600 : 700,
              marginTop: '2px',
              transition: 'all 0.2s ease'
            }}
          >
            <span
              style={{
                display: 'inline-block',
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                backgroundColor: dotColor,
                boxShadow: isAvailable ? '0 0 6px rgba(16, 185, 129, 0.6)' : '0 0 6px rgba(239, 68, 68, 0.6)',
                animation: isAvailable ? 'headerDotGlow 2s infinite ease-in-out' : 'none',
                flexShrink: 0
              }}
            />
            <span>{statusLabel}</span>
          </div>
        </div>
      </div>

      {/* Nút Đơn của bạn */}
      <button
        onClick={onOpenMyOrders}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding: '7px 13px',
          borderRadius: '999px',
          backgroundColor: hasActiveOrder ? 'var(--color-primary-light, #E7F4ED)' : '#FFFFFF',
          border: `1.5px solid ${hasActiveOrder ? 'var(--color-primary, #137A49)' : '#E2E8F0'}`,
          color: hasActiveOrder ? 'var(--color-primary, #137A49)' : '#0F172A',
          fontSize: '13px',
          fontWeight: 700,
          boxShadow: hasActiveOrder ? '0 2px 8px rgba(19, 122, 73, 0.15)' : '0 1px 3px rgba(0, 0, 0, 0.05)',
          transition: 'all 0.15s ease',
          flexShrink: 0,
          cursor: 'pointer'
        }}
      >
        <span>Đơn của bạn</span>
        {hasActiveOrder && (
          <span
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: '#DC2626',
              boxShadow: '0 0 6px rgba(220, 38, 38, 0.6)',
              animation: 'pulseGlow 1.5s infinite'
            }}
          />
        )}
      </button>
    </header>
  );
};
