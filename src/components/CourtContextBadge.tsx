import React from 'react';

interface CourtContextBadgeProps {
  courtName: string;
}

export const CourtContextBadge: React.FC<CourtContextBadgeProps> = ({ courtName }) => {
  return (
    <section style={{
      padding: '14px 16px',
      backgroundColor: 'var(--color-surface)',
      borderBottom: '1px solid var(--color-border)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '12px'
    }}>
      <div style={{ flex: 1 }}>
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding: '4px 10px',
          backgroundColor: 'var(--color-deep)',
          color: 'var(--color-accent)',
          borderRadius: 'var(--radius-sm)',
          fontWeight: 800,
          fontSize: 'var(--font-size-base)',
          letterSpacing: '0.3px',
          marginBottom: '4px'
        }}>
          <span style={{ color: '#FFFFFF', opacity: 0.8, fontSize: 'var(--font-size-xs)', fontWeight: 500 }}>VỊ TRÍ:</span>
          {courtName}
        </div>
        <p style={{
          fontSize: 'var(--font-size-sm)',
          color: 'var(--color-text-muted)',
          margin: 0,
          lineHeight: 1.35
        }}>
          Chọn nước giải khát, nhân viên sẽ mang ra tận sân thi đấu.
        </p>
      </div>

      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        justifyContent: 'center',
        padding: '6px 10px',
        backgroundColor: 'var(--color-primary-light)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-sm)',
        textAlign: 'right'
      }}>
        <span style={{ fontSize: '11px', color: 'var(--color-primary)', fontWeight: 700 }}>THANH TOÁN</span>
        <span style={{ fontSize: '12px', color: 'var(--color-deep)', fontWeight: 600 }}>Khi nhận nước</span>
      </div>
    </section>
  );
};
