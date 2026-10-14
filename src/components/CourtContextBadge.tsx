import React from 'react';

interface CourtContextBadgeProps {
  courtName: string;
}

export const CourtContextBadge: React.FC<CourtContextBadgeProps> = ({ courtName }) => {
  return (
    <section
      style={{
        padding: '8px 16px',
        backgroundColor: '#FFFFFF',
        borderBottom: '1px solid var(--color-border, #E2E9E2)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        boxSizing: 'border-box'
      }}
    >
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '7px',
          padding: '5px 12px',
          backgroundColor: '#0F3728',
          borderRadius: '999px',
          boxShadow: '0 2px 6px rgba(15, 55, 40, 0.15)',
          border: '1px solid rgba(213, 239, 118, 0.25)'
        }}
      >
        <span
          style={{
            display: 'inline-block',
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            backgroundColor: '#D5EF76',
            boxShadow: '0 0 6px #D5EF76'
          }}
        />
        <span
          style={{
            color: '#A7F3D0',
            fontSize: '11px',
            fontWeight: 700,
            letterSpacing: '0.5px'
          }}
        >
          VỊ TRÍ:
        </span>
        <span
          style={{
            color: '#D5EF76',
            fontWeight: 900,
            fontSize: '14px',
            letterSpacing: '0.4px',
            textTransform: 'uppercase'
          }}
        >
          {courtName}
        </span>
      </div>

      <div
        style={{
          fontSize: '11px',
          fontWeight: 600,
          color: '#137A49',
          letterSpacing: '0.2px'
        }}
      >
        Phục vụ tận sân
      </div>
    </section>
  );
};
