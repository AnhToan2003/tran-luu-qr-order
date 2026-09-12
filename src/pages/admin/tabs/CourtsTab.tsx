import React from 'react';
import { Court } from '../../../types/order';

interface CourtsTabProps {
  courts: Court[];
  onDownloadAllCourtsPdf: () => void;
  onOpenAddCourtModal: () => void;
  onToggleCourt: (court: Court) => void;
  onOpenQrPreview: (court: Court) => void;
  onDownloadCourtQrPng: (court: Court) => void;
  onOpenEditCourtModal: (court: Court) => void;
  onDeleteCourt: (id: string, name: string) => void;
}

export const CourtsTab: React.FC<CourtsTabProps> = ({
  courts,
  onDownloadAllCourtsPdf,
  onOpenAddCourtModal,
  onToggleCourt,
  onOpenQrPreview,
  onDownloadCourtQrPng,
  onOpenEditCourtModal,
  onDeleteCourt,
}) => {
  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 800, color: 'var(--color-deep)' }}>
            Quản Lý Sân & Bộ Tạo Mã QR In Ấn
          </h2>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={onDownloadAllCourtsPdf}
            style={{
              padding: '10px 18px',
              backgroundColor: 'var(--color-deep)',
              color: 'var(--color-accent)',
              borderRadius: 'var(--radius-md)',
              fontWeight: 800,
              fontSize: 'var(--font-size-sm)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: 'var(--shadow-sm)'
            }}
          >
            <span>📄 TẢI PDF IN ẤN {courts.length} SÂN (A4)</span>
          </button>

          <button
            onClick={onOpenAddCourtModal}
            style={{
              padding: '10px 16px',
              backgroundColor: 'var(--color-primary)',
              color: '#FFFFFF',
              borderRadius: 'var(--radius-md)',
              fontWeight: 700,
              fontSize: 'var(--font-size-sm)'
            }}
          >
            <span>➕ Thêm sân mới</span>
          </button>
        </div>
      </div>

      {/* Grid 16 Courts */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '16px' }}>
        {courts.map(court => (
          <div key={court.id} style={{
            backgroundColor: 'var(--color-surface)',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--color-border)',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            boxShadow: 'var(--shadow-sm)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{
                backgroundColor: 'var(--color-deep)',
                color: 'var(--color-accent)',
                fontWeight: 900,
                fontSize: '18px',
                padding: '4px 12px',
                borderRadius: 'var(--radius-sm)'
              }}>
                {court.name}
              </span>
              <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                Mã: {court.code}
              </span>
            </div>

            <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', margin: 0 }}>
              Mã QR liên kết: <code>/order?court={court.code}</code>
            </p>

            {/* Toggle On/Off nhận đơn cho Sân */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 10px',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: court.isActive !== false ? 'rgba(34, 197, 94, 0.08)' : 'rgba(239, 68, 68, 0.08)',
              border: `1px solid ${court.isActive !== false ? '#86EFAC' : '#FCA5A5'}`
            }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: court.isActive !== false ? '#15803D' : '#991B1B' }}>
                {court.isActive !== false ? '🟢 ĐANG NHẬN ĐƠN' : '🔴 TẠM TẮT ĐƠN'}
              </span>
              <button
                onClick={() => onToggleCourt(court)}
                style={{
                  padding: '4px 10px',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: court.isActive !== false ? '#EF4444' : '#15803D',
                  color: '#FFFFFF',
                  fontWeight: 700,
                  fontSize: '11px',
                  cursor: 'pointer',
                  border: 'none'
                }}
                title="Bấm để Bật hoặc Tắt nhận đơn cho sân này (Set On/Off cho Sân)"
              >
                {court.isActive !== false ? 'Tắt nhận' : 'Bật nhận'}
              </button>
            </div>

            <div style={{ display: 'flex', gap: '6px', marginTop: 'auto', flexWrap: 'wrap' }}>
              <button
                onClick={() => onOpenQrPreview(court)}
                style={{
                  flex: 1,
                  padding: '8px 6px',
                  backgroundColor: 'var(--color-primary-light)',
                  color: 'var(--color-primary)',
                  borderRadius: 'var(--radius-sm)',
                  fontWeight: 700,
                  fontSize: 'var(--font-size-xs)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '4px'
                }}
              >
                <span>🔍 QR</span>
              </button>

              <button
                onClick={() => onDownloadCourtQrPng(court)}
                style={{
                  padding: '8px 8px',
                  backgroundColor: 'var(--color-bg)',
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-deep)',
                  borderRadius: 'var(--radius-sm)',
                  fontWeight: 700,
                  fontSize: 'var(--font-size-xs)'
                }}
                title="Tải ảnh PNG"
              >
                💾 PNG
              </button>

              <button
                onClick={() => onOpenEditCourtModal(court)}
                style={{
                  padding: '8px 8px',
                  backgroundColor: 'var(--color-bg)',
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-deep)',
                  borderRadius: 'var(--radius-sm)',
                  fontWeight: 700,
                  fontSize: 'var(--font-size-xs)'
                }}
                title="Đổi tên sân hiển thị"
              >
                ✏️ Sửa
              </button>

              <button
                onClick={() => onDeleteCourt(court.id, court.name)}
                style={{
                  padding: '8px 8px',
                  backgroundColor: '#FEE2E2',
                  color: '#DC2626',
                  borderRadius: 'var(--radius-sm)',
                  fontWeight: 700,
                  fontSize: 'var(--font-size-xs)'
                }}
                title="Xóa sân (sẽ bị chặn nếu có đơn mở)"
              >
                🗑️
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};