import React, { useState, useEffect, useRef } from 'react';
import { apiFetch } from '../lib/api';

interface AdminPasswordConfirmModalProps {
  isOpen: boolean;
  title?: string;
  actionDescription?: string;
  confirmButtonText?: string;
  onClose: () => void;
  onSuccess: () => void;
}

export const AdminPasswordConfirmModal: React.FC<AdminPasswordConfirmModalProps> = ({
  isOpen,
  title = 'Xác Nhận Mật Khẩu Quản Trị',
  actionDescription = 'Thao tác này ảnh hưởng trực tiếp đến dữ liệu kho và kế toán. Vui lòng nhập mật khẩu quản trị viên để tiếp tục.',
  confirmButtonText = 'Xác Nhận Mật Khẩu',
  onClose,
  onSuccess
}) => {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setPassword('');
      setErrorMessage('');
      setShowPassword(false);
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanPassword = password.trim();
    if (!cleanPassword) {
      setErrorMessage('Vui lòng nhập mật khẩu');
      return;
    }

    setIsVerifying(true);
    setErrorMessage('');
    try {
      const res = await apiFetch('/api/admin/auth/verify-action-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: cleanPassword })
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Mật khẩu quản trị viên không chính xác');
      }

      onClose();
      onSuccess();
    } catch (err: any) {
      setErrorMessage(err.message || 'Mật khẩu không chính xác. Vui lòng thử lại!');
      inputRef.current?.focus();
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(15, 23, 42, 0.75)',
      backdropFilter: 'blur(5px)',
      zIndex: 9999,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '16px'
    }}>
      <div
        role="dialog"
        aria-modal="true"
        style={{
          width: '100%',
          maxWidth: '440px',
          backgroundColor: '#FFFFFF',
          borderRadius: '16px',
          boxShadow: '0 20px 45px rgba(0, 0, 0, 0.25)',
          overflow: 'hidden',
          border: '1px solid #E2E8F0',
          animation: 'fadeIn 0.15s ease-out'
        }}
      >
        {/* Header */}
        <div style={{
          padding: '18px 20px',
          borderBottom: '1px solid #F1F5F9',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: '#F8FAFC'
        }}>
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
              {title}
            </h3>
            <p style={{ fontSize: '12px', color: '#64748B', margin: '4px 0 0 0' }}>
              Xác thực quyền quản trị viên
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isVerifying}
            style={{
              padding: '6px 10px',
              borderRadius: '8px',
              backgroundColor: '#FFFFFF',
              border: '1px solid #CBD5E1',
              color: '#64748B',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            Đóng
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} style={{ padding: '20px' }}>
          <p style={{ fontSize: '13px', color: '#334155', lineHeight: 1.5, marginBottom: '16px' }}>
            {actionDescription}
          </p>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#0F172A', marginBottom: '6px' }}>
              Mật khẩu Admin <span style={{ color: '#DC2626' }}>*</span>
            </label>
            <div style={{ position: 'relative' }}>
              <input
                ref={inputRef}
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => {
                  setPassword(e.target.value);
                  if (errorMessage) setErrorMessage('');
                }}
                placeholder="Nhập mật khẩu quản trị viên"
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '11px 44px 11px 14px',
                  borderRadius: '10px',
                  border: errorMessage ? '1.5px solid #EF4444' : '1.5px solid #CBD5E1',
                  fontSize: '15px',
                  outline: 'none',
                  color: '#0F172A',
                  backgroundColor: '#FFFFFF'
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
                style={{
                  position: 'absolute',
                  right: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: '#64748B',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  padding: '4px 6px'
                }}
              >
                {showPassword ? 'Ẩn' : 'Hiện'}
              </button>
            </div>

            {errorMessage && (
              <div style={{
                marginTop: '8px',
                padding: '8px 12px',
                borderRadius: '8px',
                backgroundColor: '#FEF2F2',
                border: '1px solid #FECDD3',
                color: '#B91C1C',
                fontSize: '12px',
                fontWeight: 700
              }}>
                {errorMessage}
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px' }}>
            <button
              type="button"
              onClick={onClose}
              disabled={isVerifying}
              style={{
                padding: '10px 16px',
                borderRadius: '8px',
                border: '1px solid #CBD5E1',
                backgroundColor: '#FFFFFF',
                color: '#334155',
                fontSize: '13px',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              Hủy Bỏ
            </button>
            <button
              type="submit"
              disabled={isVerifying}
              style={{
                padding: '10px 20px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: isVerifying ? '#94A3B8' : '#10B981',
                color: '#FFFFFF',
                fontSize: '13px',
                fontWeight: 800,
                cursor: isVerifying ? 'not-allowed' : 'pointer',
                boxShadow: '0 2px 6px rgba(16, 185, 129, 0.25)'
              }}
            >
              {isVerifying ? 'Đang xác thực...' : confirmButtonText}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
