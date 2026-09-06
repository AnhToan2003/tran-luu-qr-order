import React from 'react';
import { formatVnd } from '../data/mockProducts';

interface FloatingCartBarProps {
  totalItems: number;
  totalVnd: number;
  courtName: string;
  onOpenCart: () => void;
}

export const FloatingCartBar: React.FC<FloatingCartBarProps> = ({
  totalItems,
  totalVnd,
  courtName,
  onOpenCart
}) => {
  if (totalItems === 0) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      padding: '10px 16px',
      paddingBottom: 'calc(10px + var(--sab))',
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      backdropFilter: 'blur(10px)',
      borderTop: '1px solid var(--color-border)',
      boxShadow: 'var(--shadow-bottom-sheet)',
      zIndex: 50,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }}>
      <div style={{
        maxWidth: '520px',
        width: '100%',
        backgroundColor: 'var(--color-deep)',
        color: '#FFFFFF',
        borderRadius: 'var(--radius-lg)',
        padding: '10px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
        boxShadow: '0 4px 16px rgba(18, 67, 46, 0.25)'
      }}>
        {/* Left: item count & total */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{
              backgroundColor: 'var(--color-accent)',
              color: 'var(--color-accent-text)',
              fontSize: '11px',
              fontWeight: 800,
              padding: '1px 6px',
              borderRadius: 'var(--radius-sm)'
            }}>
              {courtName}
            </span>
            <span style={{ fontSize: 'var(--font-size-xs)', color: '#D2E3D8' }}>
              {totalItems} chai nước
            </span>
          </div>
          <div style={{
            fontSize: 'var(--font-size-lg)',
            fontWeight: 800,
            color: '#FFFFFF',
            lineHeight: 1.2,
            marginTop: '2px'
          }}>
            {formatVnd(totalVnd)}
          </div>
        </div>

        {/* Right CTA */}
        <button
          onClick={onOpenCart}
          style={{
            backgroundColor: 'var(--color-primary)',
            color: '#FFFFFF',
            padding: '10px 18px',
            borderRadius: 'var(--radius-md)',
            fontWeight: 700,
            fontSize: 'var(--font-size-sm)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            transition: 'var(--transition-fast)'
          }}
        >
          <span>Xem giỏ hàng</span>
          <span style={{ fontSize: '16px' }}>→</span>
        </button>
      </div>
    </div>
  );
};
