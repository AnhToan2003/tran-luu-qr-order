import React, { useState, useRef } from 'react';
import { ImageCropModal } from './ImageCropModal.js';

export interface ImageDropzoneProps {
  imageUrl: string;
  onChange: (url: string) => void;
  disabled?: boolean;
  label?: string;
}

export const ImageDropzone: React.FC<ImageDropzoneProps> = ({
  imageUrl,
  onChange,
  disabled,
  label = 'HÌNH ẢNH SẢN PHẨM (KÉO THẢ HOẶC CHỌN TỪ MÁY)'
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [pendingCropSrc, setPendingCropSrc] = useState<string | null>(null);
  const [isCropOpen, setIsCropOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const readFileAsDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      if (!file.type.startsWith('image/')) {
        reject(new Error('Vui lòng chỉ chọn file hình ảnh (PNG, JPG, WEBP,...)'));
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        resolve(result);
      };
      reader.onerror = () => reject(new Error('Lỗi khi đọc file ảnh'));
      reader.readAsDataURL(file);
    });
  };

  const handleFile = async (file: File) => {
    setUploadError('');
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setPendingCropSrc(dataUrl);
      setIsCropOpen(true);
    } catch (err: any) {
      setUploadError(err.message || 'Lỗi xử lý file ảnh');
    }
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (disabled) return;
    setIsDragging(true);
  };

  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled) return;
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFile(e.target.files[0]);
      // reset input value so re-selecting the same file still triggers onChange
      e.target.value = '';
    }
  };

  const handleOpenEditCurrent = () => {
    if (!imageUrl || disabled) return;
    setPendingCropSrc(imageUrl);
    setIsCropOpen(true);
  };

  const handleCropConfirm = (croppedDataUrl: string) => {
    onChange(croppedDataUrl);
    setIsCropOpen(false);
    setPendingCropSrc(null);
  };

  const handleCropCancel = () => {
    setIsCropOpen(false);
    setPendingCropSrc(null);
  };

  return (
    <div style={{ marginBottom: '16px' }}>
      <label style={{ display: 'block', fontWeight: 800, fontSize: '12px', color: '#475569', marginBottom: '6px' }}>
        {label}
      </label>

      {imageUrl ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
            padding: '12px',
            borderRadius: '10px',
            border: '1px solid #CBD5E1',
            backgroundColor: '#F8FAFC'
          }}
        >
          {/* Thumbnail Preview */}
          <div
            onClick={handleOpenEditCurrent}
            style={{
              width: '68px',
              height: '68px',
              borderRadius: '8px',
              backgroundColor: '#FFFFFF',
              border: '1px solid #E2E8F0',
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              cursor: disabled ? 'default' : 'pointer',
              position: 'relative',
              boxShadow: '0 1px 3px rgba(0,0,0,0.06)'
            }}
            title="Nhấn để cắt & zoom lại ảnh này"
          >
            <img
              src={imageUrl}
              alt="Preview"
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover'
              }}
              onError={(e) => {
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
          </div>

          {/* Details & Actions */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
              <span style={{ fontSize: '12px', color: '#10B981', fontWeight: 800 }}>
                ✓ Đã tải ảnh thành công
              </span>
              <span style={{ fontSize: '11px', color: '#94A3B8' }}>(Tỷ lệ 1:1)</span>
            </div>

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {/* Nút cắt & zoom ảnh */}
              <button
                type="button"
                disabled={disabled}
                onClick={handleOpenEditCurrent}
                style={{
                  padding: '5px 12px',
                  backgroundColor: '#EFF6FF',
                  color: '#2563EB',
                  border: '1px solid #BFDBFE',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
                title="Kéo thả vị trí, phóng to/thu nhỏ sản phẩm"
              >
                <span>✂️</span> Chỉnh sửa / Cắt ảnh
              </button>

              {/* Đổi ảnh khác */}
              <button
                type="button"
                disabled={disabled}
                onClick={() => fileInputRef.current?.click()}
                style={{
                  padding: '5px 12px',
                  backgroundColor: '#FFFFFF',
                  color: '#334155',
                  border: '1px solid #CBD5E1',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Đổi ảnh khác
              </button>

              {/* Xóa ảnh */}
              <button
                type="button"
                disabled={disabled}
                onClick={() => onChange('')}
                style={{
                  padding: '5px 12px',
                  backgroundColor: '#FFF1F2',
                  color: '#E11D48',
                  border: '1px solid #FECDD3',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Xóa ảnh
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={() => !disabled && fileInputRef.current?.click()}
          style={{
            border: isDragging ? '2px dashed #10B981' : '2px dashed #CBD5E1',
            backgroundColor: isDragging ? '#F0FDF4' : '#F8FAFC',
            borderRadius: '10px',
            padding: '20px 16px',
            textAlign: 'center',
            cursor: disabled ? 'not-allowed' : 'pointer',
            transition: 'all 0.15s ease'
          }}
        >
          <div style={{ fontSize: '24px', marginBottom: '6px' }}>🖼️</div>
          <div style={{ fontSize: '13px', fontWeight: 800, color: '#1E293B', marginBottom: '4px' }}>
            Kéo và thả file ảnh vào đây, hoặc click để chọn từ máy
          </div>
          <div style={{ fontSize: '11px', color: '#64748B' }}>
            Hỗ trợ PNG, JPG, WEBP • Kèm công cụ kéo thả để cắt & zoom sản phẩm trực quan
          </div>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={onFileChange}
      />

      {uploadError && (
        <div style={{ color: '#DC2626', fontSize: '12px', marginTop: '6px', fontWeight: 600 }}>
          {uploadError}
        </div>
      )}

      {/* Interactive Crop & Zoom Modal */}
      {isCropOpen && pendingCropSrc && (
        <ImageCropModal
          isOpen={isCropOpen}
          imageSrc={pendingCropSrc}
          onConfirm={handleCropConfirm}
          onCancel={handleCropCancel}
          boxSize={320}
          outputSize={600}
        />
      )}
    </div>
  );
};
