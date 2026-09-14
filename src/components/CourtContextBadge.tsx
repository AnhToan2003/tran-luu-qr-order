import React from 'react';

interface CourtContextBadgeProps {
  courtName: string;
}

export const CourtContextBadge: React.FC<CourtContextBadgeProps> = ({ courtName }) => {
  return (
    <section style={{
      padding: '10px 16px',
      backgroundColor: 'var(--color-surface)',
      borderBottom: '1px solid var(--color-border)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'flex-start'
    }}>
      <div style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '5px 12px',
        backgroundColor: 'var(--color-deep)',
        color: 'var(--color-accent)',
        borderRadius: 'var(--radius-sm)',
        fontWeight: 800,
        fontSize: 'var(--font-size-base)',
        letterSpacing: '0.3px'
      }}>
        <span style={{ color: '#FFFFFF', opacity: 0.8, fontSize: 'var(--font-size-xs)', fontWeight: 500 }}>VỊ TRÍ:</span>
        {courtName}
      </div>
    </section>
  );
};
