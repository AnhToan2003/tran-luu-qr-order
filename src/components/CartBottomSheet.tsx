import React, { useState, useEffect } from 'react';
import { OrderItem } from '../types/order';
import { formatVnd } from '../types/product';

interface CartBottomSheetProps {
  isOpen: boolean;
  courtName: string;
  sessionToken?: string;
  items: OrderItem[];
  totalVnd: number;
  onClose: () => void;
  onUpdateQuantity: (productId: string, newQty: number) => void;
  onRemoveItem: (productId: string) => void;
  onSubmitOrder: (customerInfo: { name: string; phone: string }) => void;
  isSubmitting: boolean;
  canSubmit: boolean;
  error?: string;
}

export const CartBottomSheet: React.FC<CartBottomSheetProps> = ({
  isOpen,
  courtName,
  sessionToken,
  items,
  totalVnd,
  onClose,
  onUpdateQuantity,
  onRemoveItem,
  onSubmitOrder,
  isSubmitting,
  canSubmit,
  error
}) => {
  // Xóa sạch key cũ tl_customer_profile khỏi localStorage để tránh tự điền dữ liệu của người trước
  useEffect(() => {
    try {
      localStorage.removeItem('tl_customer_profile');
    } catch { }
  }, []);

  const [prevCourt, setPrevCourt] = useState<string>(courtName);
  const storageKey = sessionToken ? `tl_session_customer_${sessionToken}` : 'tl_session_customer_info';

  const [customerName, setCustomerName] = useState<string>(() => {
    try {
      const saved = sessionStorage.getItem(storageKey) || sessionStorage.getItem('tl_session_customer_info');
      return saved ? JSON.parse(saved).name || '' : '';
    } catch {
      return '';
    }
  });

  const [customerPhone, setCustomerPhone] = useState<string>(() => {
    try {
      const saved = sessionStorage.getItem(storageKey) || sessionStorage.getItem('tl_session_customer_info');
      return saved ? JSON.parse(saved).phone || '' : '';
    } catch {
      return '';
    }
  });

  let activeName = customerName;
  let activePhone = customerPhone;

  if (courtName !== prevCourt) {
    setPrevCourt(courtName);
    setCustomerName('');
    setCustomerPhone('');
    activeName = '';
    activePhone = '';
  }

  const [validationError, setValidationError] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      setValidationError('');
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') onClose();
      };
      window.addEventListener('keydown', handleKeyDown);

      try {
        const saved = sessionStorage.getItem(storageKey) || sessionStorage.getItem('tl_session_customer_info');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed.name) setCustomerName(parsed.name);
          if (parsed.phone) setCustomerPhone(parsed.phone);
        }
      } catch { }

      return () => {
        document.body.style.overflow = originalOverflow;
        window.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [isOpen, onClose, storageKey]);

  const handleClearProfile = () => {
    setCustomerName('');
    setCustomerPhone('');
    try {
      sessionStorage.removeItem(storageKey);
      sessionStorage.removeItem('tl_session_customer_info');
    } catch { }
  };

  const handleValidateAndSubmit = () => {
    setValidationError('');
    const trimmedName = customerName.trim();
    const trimmedPhone = customerPhone.trim().replace(/[\s.-]/g, '');

    if (!trimmedName || trimmedName.length < 2) {
      setValidationError('Vui lòng nhập họ và tên của bạn (tối thiểu 2 ký tự)');
      return;
    }

    // Kiểm tra định dạng số điện thoại Việt Nam (10 chữ số, bắt đầu bằng 03, 05, 07, 08, 09 hoặc +84)
    const phoneRegex = /^(0|\+84)(3|5|7|8|9)[0-9]{8}$/;
    if (!phoneRegex.test(trimmedPhone)) {
      setValidationError('Số điện thoại không hợp lệ. Vui lòng nhập đủ 10 chữ số (VD: 0901234567)');
      return;
    }

    // Lưu trong sessionStorage của phiên hiện tại
    try {
      sessionStorage.setItem(storageKey, JSON.stringify({ name: trimmedName, phone: trimmedPhone }));
    } catch { }

    onSubmitOrder({ name: trimmedName, phone: trimmedPhone });
  };

  if (!isOpen) return null;

  const totalBottles = items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(10, 41, 28, 0.65)',
      backdropFilter: 'blur(4px)',
      zIndex: 100,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'flex-end',
      alignItems: 'center'
    }}>
      {error && <p role="alert" style={{ position: 'relative', zIndex: 3, background: '#fee2e2', padding: 12, color: '#991b1b' }}>{error}</p>}
      {/* Backdrop tap to close */}
      <div
        onClick={onClose}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 1
        }}
      />

      {/* Sheet panel */}
      <div role="dialog" aria-modal="true" aria-label="Giỏ hàng gọi nước" className="animate-slide-up cart-bottom-sheet-panel" style={{
        position: 'relative',
        zIndex: 2,
        width: '100%',
        maxWidth: '540px',
        maxHeight: '85vh',
        boxSizing: 'border-box',
        overflowX: 'hidden',
        backgroundColor: 'var(--color-surface)',
        borderTopLeftRadius: 'var(--radius-xl)',
        borderTopRightRadius: 'var(--radius-xl)',
        boxShadow: 'var(--shadow-bottom-sheet)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}>
        {/* Drag Handle & Header */}
        <div style={{
          padding: '12px 20px',
          borderBottom: '1px solid var(--color-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: 'var(--color-surface)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{
              fontSize: '18px',
              fontWeight: 900,
              color: '#0F172A'
            }}>
              Giỏ hàng của bạn
            </span>
            <span style={{
              backgroundColor: '#0F172A',
              color: '#F8FAFC',
              fontSize: '13px',
              fontWeight: 800,
              padding: '3px 10px',
              borderRadius: 'var(--radius-sm)'
            }}>
              {courtName}
            </span>
          </div>

          <button
            onClick={onClose}
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              backgroundColor: 'var(--color-bg)',
              color: '#0F172A',
              fontSize: '18px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800
            }}
            aria-label="Đóng giỏ hàng"
          >
            ✕
          </button>
        </div>

        {/* Item List Scroll Area */}
        <div style={{
          padding: '16px 20px',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
          flex: 1
        }}>
          {items.length === 0 ? (
            <div style={{
              padding: '40px 20px',
              textAlign: 'center',
              color: '#334155'
            }}>
              <p style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A' }}>Giỏ hàng đang trống</p>
              <p style={{ fontSize: '14px', marginTop: '6px', fontWeight: 600, color: '#334155' }}>Hãy chọn đồ uống mát lạnh cho buổi chơi cầu nhé!</p>
            </div>
          ) : (
            items.map((item) => {
              const productDef = item.imageSvg ? { imageSvg: item.imageSvg } : null;
              return (
                <div
                  key={item.productId}
                  style={{
                    backgroundColor: 'var(--color-bg)',
                    borderRadius: 'var(--radius-md)',
                    border: '1.5px solid var(--color-border)',
                    padding: '12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px'
                  }}
                >
                  {/* Top Row: Product Info & Quantity */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {/* Small bottle art */}
                    <div style={{
                      width: '48px',
                      height: '48px',
                      backgroundColor: 'var(--color-surface)',
                      borderRadius: 'var(--radius-sm)',
                      padding: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}>
                      {productDef && (
                        <img
                          src={productDef.imageSvg}
                          alt={item.name}
                          style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }}
                        />
                      )}
                    </div>

                    {/* Name & Unit Price */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: '15px',
                        fontWeight: 800,
                        color: '#0F172A',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}>
                        {item.name}
                      </div>
                      <div style={{
                        fontSize: '13px',
                        fontWeight: 600,
                        color: '#334155'
                      }}>
                        {item.volume} • <span style={{ fontWeight: 800, color: '#0F172A' }}>{formatVnd(item.unitPrice)}</span>
                      </div>
                    </div>

                    {/* Stepper for Bottles */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      backgroundColor: 'var(--color-surface)',
                      borderRadius: 'var(--radius-sm)',
                      border: '1.5px solid var(--color-border)'
                    }}>
                      <button
                        onClick={() => onUpdateQuantity(item.productId, item.quantity - 1)}
                        style={{
                          width: '32px',
                          height: '32px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: 'var(--color-primary)',
                          fontWeight: 900,
                          fontSize: '18px'
                        }}
                      >
                        −
                      </button>
                      <span style={{
                        minWidth: '26px',
                        textAlign: 'center',
                        fontWeight: 900,
                        fontSize: '15px',
                        color: '#0F172A'
                      }}>
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => onUpdateQuantity(item.productId, item.quantity + 1)}
                        style={{
                          width: '32px',
                          height: '32px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: 'var(--color-primary)',
                          fontWeight: 900,
                          fontSize: '18px'
                        }}
                      >
                        +
                      </button>
                    </div>

                    {/* Delete item */}
                    <button
                      onClick={() => onRemoveItem(item.productId)}
                      style={{
                        padding: '6px',
                        color: '#64748B',
                        fontSize: '16px',
                        lineHeight: 1,
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer'
                      }}
                      title="Xóa món này"
                    >
                      🗑️
                    </button>
                  </div>

                </div>
              );
            })
          )}
        </div>

        {/* Footer Summary & Place Order */}
        {items.length > 0 && (
          <div style={{
            padding: '16px 20px',
            paddingBottom: 'calc(16px + var(--sab))',
            borderTop: '1px solid var(--color-border)',
            backgroundColor: 'var(--color-surface)',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}>
            {/* Breakdown */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              fontSize: '13px',
              color: '#334155'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 600 }}>Tổng số lượng món ({totalBottles}):</span>
                <span style={{ fontWeight: 800, color: '#0F172A' }}>{formatVnd(totalVnd)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 600 }}>Địa điểm giao:</span>
                <span style={{ fontWeight: 900, color: '#0F172A' }}>{courtName}</span>
              </div>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                paddingTop: '8px',
                borderTop: '1px dashed var(--color-border)',
                fontSize: '15px',
                fontWeight: 900,
                color: '#0F172A'
              }}>
                <span>Tổng cần thanh toán:</span>
                <span style={{ fontSize: '22px', fontWeight: 900, color: '#059669' }}>
                  {formatVnd(totalVnd)}
                </span>
              </div>
            </div>

            {/* Customer Info Form (Required for counter collection later) */}
            <div style={{
              backgroundColor: 'var(--color-bg)',
              borderRadius: 'var(--radius-md)',
              border: validationError ? '2px solid #EF4444' : '1.5px solid var(--color-border)',
              padding: '12px 14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '15px' }}>👤</span>
                  <span style={{ fontSize: '12px', fontWeight: 900, color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Thông tin người đặt
                  </span>
                </div>
                {(customerName || customerPhone) && (
                  <button
                    type="button"
                    onClick={handleClearProfile}
                    style={{
                      fontSize: '11px',
                      color: '#DC2626',
                      backgroundColor: '#FEE2E2',
                      border: 'none',
                      padding: '3px 8px',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontWeight: 800
                    }}
                    title="Xóa thông tin để nhập người khác"
                  >
                    ✕ Đổi người
                  </button>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '13px', fontWeight: 800, color: '#0F172A', display: 'block', marginBottom: '4px' }}>
                    Họ và tên <span style={{ color: '#DC2626' }}>*</span>
                  </label>
                  <input
                    type="text"
                    autoComplete="name"
                    value={activeName}
                    onChange={e => {
                      setCustomerName(e.target.value);
                      if (validationError) setValidationError('');
                    }}
                    placeholder="VD: Anh Tuấn"
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      padding: '10px 12px',
                      borderRadius: 'var(--radius-sm)',
                      border: '1.5px solid var(--color-border)',
                      fontSize: '16px', // Bắt buộc >= 16px để ngăn iOS Safari auto-zoom
                      fontWeight: 600,
                      color: '#0F172A',
                      backgroundColor: 'var(--color-surface)',
                      outline: 'none'
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '13px', fontWeight: 800, color: '#0F172A', display: 'block', marginBottom: '4px' }}>
                    Số điện thoại <span style={{ color: '#DC2626' }}>*</span>
                  </label>
                  <input
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    value={activePhone}
                    onChange={e => {
                      setCustomerPhone(e.target.value);
                      if (validationError) setValidationError('');
                    }}
                    placeholder="VD: 0901234567"
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      padding: '10px 12px',
                      borderRadius: 'var(--radius-sm)',
                      border: '1.5px solid var(--color-border)',
                      fontSize: '16px', // Bắt buộc >= 16px để ngăn iOS Safari auto-zoom
                      fontWeight: 600,
                      color: '#0F172A',
                      backgroundColor: 'var(--color-surface)',
                      outline: 'none'
                    }}
                  />
                </div>
              </div>

              {validationError && (
                <div style={{ fontSize: '12px', color: '#DC2626', fontWeight: 800, backgroundColor: '#FEE2E2', padding: '8px 12px', borderRadius: '6px' }}>
                  ⚠️ {validationError}
                </div>
              )}
            </div>

            {/* Submit Button */}
            <button
              onClick={handleValidateAndSubmit}
              disabled={isSubmitting || !canSubmit}
              style={{
                width: '100%',
                padding: '14px',
                backgroundColor: isSubmitting ? '#94A3B8' : 'var(--color-primary)',
                color: '#FFFFFF',
                borderRadius: 'var(--radius-md)',
                fontSize: '15px',
                fontWeight: 900,
                letterSpacing: '0.02em',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                boxShadow: 'var(--shadow-md)',
                transition: 'var(--transition-fast)',
                border: 'none',
                cursor: isSubmitting || !canSubmit ? 'not-allowed' : 'pointer'
              }}
            >
              {isSubmitting ? (
                <span>Đang gửi đơn...</span>
              ) : (
                <>
                  <span>XÁC NHẬN ĐẶT HÀNG</span>
                  <span>•</span>
                  <span>{formatVnd(totalVnd)}</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
