import React, { useState, useEffect } from 'react';
import { formatVnd } from '../types/product';

interface FloatingCartBarProps {
  totalItems: number;
  totalVnd: number;
  courtName: string;
  onOpenCart: () => void;
  reservationExpiresAt?: number | null;
}

export const FloatingCartBar: React.FC<FloatingCartBarProps> = ({
  totalItems,
  totalVnd,
  courtName,
  onOpenCart,
  reservationExpiresAt
}) => {
  const [remainingSeconds, setRemainingSeconds] = useState<number>(() => {
    if (!reservationExpiresAt) return 0;
    return Math.max(0, Math.ceil((reservationExpiresAt - Date.now()) / 1000));
  });

  useEffect(() => {
    if (!reservationExpiresAt) {
      setRemainingSeconds(0);
      return;
    }
    const update = () => {
      const rem = Math.max(0, Math.ceil((reservationExpiresAt - Date.now()) / 1000));
      setRemainingSeconds(rem);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [reservationExpiresAt]);

  if (totalItems === 0) return null;

  const isExpiringSoon = remainingSeconds > 0 && remainingSeconds <= 30;
  const isExpired = reservationExpiresAt !== null && remainingSeconds === 0;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        padding: '10px 14px',
        paddingBottom: 'calc(12px + var(--sab, env(safe-area-inset-bottom, 0px)))',
        zIndex: 50,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none'
      }}
    >
      <div
        onClick={onOpenCart}
        role="button"
        tabIndex={0}
        aria-label="Xem chi tiết giỏ hàng"
        style={{
          pointerEvents: 'auto',
          maxWidth: '480px',
          width: '100%',
          backgroundColor: '#092318',
          backgroundImage: 'linear-gradient(135deg, #092318 0%, #12432E 100%)',
          color: '#FFFFFF',
          borderRadius: '20px',
          overflow: 'hidden',
          boxShadow: '0 10px 32px rgba(9, 35, 24, 0.45), 0 2px 10px rgba(0, 0, 0, 0.25)',
          border: '1.5px solid rgba(213, 239, 118, 0.22)',
          cursor: 'pointer',
          transition: 'transform 0.15s ease, box-shadow 0.15s ease',
          userSelect: 'none'
        }}
      >
        {/* Dải thông báo đếm ngược giữ món nằm gọn gàng bên trên */}
        {reservationExpiresAt !== null && (
          <div
            style={{
              backgroundColor: isExpired
                ? '#991B1B'
                : isExpiringSoon
                ? '#DC2626'
                : 'rgba(255, 255, 255, 0.12)',
              padding: '4px 12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              fontSize: '11px',
              fontWeight: 700,
              letterSpacing: '0.2px',
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
              color: '#FFFFFF',
              fontVariantNumeric: 'tabular-nums',
              whiteSpace: 'nowrap'
            }}
          >
            <span>
              {isExpired
                ? 'Đã hết thời hạn giữ món'
                : isExpiringSoon
                ? 'Sắp hết hạn giữ món:'
                : 'Đang giữ món trong giỏ:'}
            </span>
            <span
              style={{
                fontWeight: 900,
                backgroundColor: 'rgba(0, 0, 0, 0.3)',
                padding: '1px 6px',
                borderRadius: '6px'
              }}
            >
              {String(Math.floor(remainingSeconds / 60)).padStart(2, '0')}:{String(remainingSeconds % 60).padStart(2, '0')}
            </span>
          </div>
        )}

        {/* Nội dung chính của thanh giỏ hàng */}
        <div
          style={{
            padding: '10px 14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px'
          }}
        >
          {/* Cụm thông tin bên trái: Tên sân, số món và Tổng tiền */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '2px',
              minWidth: 0,
              flex: 1
            }}
          >
            {/* Dòng trên: Huy hiệu sân và số lượng món */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                whiteSpace: 'nowrap',
                overflow: 'hidden'
              }}
            >
              <span
                style={{
                  backgroundColor: '#D5EF76',
                  color: '#0F3B2A',
                  fontSize: '11px',
                  fontWeight: 900,
                  padding: '2px 8px',
                  borderRadius: '999px',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                  letterSpacing: '0.3px'
                }}
              >
                {courtName}
              </span>
              <span
                style={{
                  color: 'rgba(255, 255, 255, 0.8)',
                  fontSize: '12px',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}
              >
                {totalItems} món đã chọn
              </span>
            </div>

            {/* Dòng dưới: Tổng tiền VNĐ nổi bật */}
            <div
              style={{
                fontSize: '18px',
                fontWeight: 900,
                color: '#FFFFFF',
                lineHeight: 1.2,
                letterSpacing: '-0.2px',
                fontVariantNumeric: 'tabular-nums',
                whiteSpace: 'nowrap'
              }}
            >
              {formatVnd(totalVnd)}
            </div>
          </div>

          {/* Cụm nút CTA bên phải */}
          <div
            style={{
              backgroundColor: '#137A49',
              backgroundImage: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
              color: '#FFFFFF',
              padding: '9px 16px',
              borderRadius: '999px',
              fontWeight: 800,
              fontSize: '13px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 3px 10px rgba(16, 185, 129, 0.4)',
              whiteSpace: 'nowrap',
              flexShrink: 0,
              pointerEvents: 'none'
            }}
          >
            <span>Xem giỏ hàng</span>
            <span style={{ fontSize: '15px', fontWeight: 900 }}>→</span>
          </div>
        </div>
      </div>
    </div>
  );
};
