import React from 'react';
import { Order, OrderStatus } from '../types/order';
import { formatVnd } from '../types/product';

interface OrderTrackingModalProps {
  order: Order;
  isOpen: boolean;
  onClose: () => void;
}

export const OrderTrackingModal: React.FC<OrderTrackingModalProps> = ({
  order,
  isOpen,
  onClose
}) => {
  React.useEffect(() => {
    if (!isOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // 3-step clean customer timeline
  const isPaid = order.paymentStatus === 'paid';
  const steps: { key: OrderStatus; label: string; desc: string }[] = [
    { key: 'accepted', label: '1. Đã tiếp nhận', desc: 'Quầy nước đã nhận đơn và đang chuẩn bị' },
    { key: 'preparing', label: '2. Đang mang ra sân', desc: 'Nhân viên đang chuẩn bị nước và đem đến sân' },
    {
      key: 'delivered',
      label: '3. Đã giao tận sân',
      desc: isPaid
        ? 'Đã nhận nước & thanh toán hoàn tất'
        : 'Đã nhận nước tận sân (Thanh toán sau trận)'
    }
  ];

  const getStepStatus = (stepKey: OrderStatus) => {
    if (order.status === 'cancelled') return 'cancelled';
    if (order.status === 'delivered') return 'completed';
    
    // Treat 'new' as accepted since counter receives immediately
    const effectiveStatus = order.status === 'new' ? 'accepted' : order.status;
    const orderIndex = ['accepted', 'preparing', 'delivered'].indexOf(effectiveStatus);
    const stepIndex = ['accepted', 'preparing', 'delivered'].indexOf(stepKey);

    if (stepIndex < orderIndex) return 'completed';
    if (stepIndex === orderIndex) return 'current';
    return 'upcoming';
  };

  const isDelivered = order.status === 'delivered';
  const isCancelled = order.status === 'cancelled';

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(10, 41, 28, 0.7)',
      backdropFilter: 'blur(5px)',
      zIndex: 110,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '16px'
    }}>
      <div role="dialog" aria-modal="true" aria-label="Chi tiết đơn hàng" className="animate-fade-in" style={{
        backgroundColor: 'var(--color-surface)',
        borderRadius: 'var(--radius-xl)',
        boxShadow: 'var(--shadow-lg)',
        width: '100%',
        maxWidth: '480px',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        border: '1px solid var(--color-border)'
      }}>
        {/* Header */}
        <div style={{
          padding: '14px 18px',
          borderBottom: '1px solid var(--color-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: 'var(--color-surface)'
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{
                fontSize: 'var(--font-size-base)',
                fontWeight: 800,
                color: 'var(--color-deep)'
              }}>
                Theo dõi đơn {order.displayCode}
              </span>
              <span style={{
                backgroundColor: 'var(--color-deep)',
                color: 'var(--color-accent)',
                fontSize: '11px',
                fontWeight: 800,
                padding: '2px 7px',
                borderRadius: 'var(--radius-sm)'
              }}>
                {order.courtName}
              </span>
            </div>
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
              Đặt lúc: {new Date(order.createdAt).toLocaleTimeString('vi-VN')}
            </span>
          </div>

          <button
            onClick={onClose}
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              backgroundColor: 'var(--color-bg)',
              color: 'var(--color-text-muted)',
              fontSize: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            ✕
          </button>
        </div>

        {/* Customer & Payment Reassurance Banner */}
        {order.customerName && (
          <div style={{
            margin: '12px 18px 0',
            padding: '8px 12px',
            backgroundColor: 'var(--color-bg)',
            borderRadius: 'var(--radius-sm)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: 'var(--font-size-xs)',
            border: '1px solid var(--color-border)'
          }}>
            <span style={{ color: 'var(--color-text-muted)' }}>
              Khách đặt: <strong style={{ color: 'var(--color-deep)' }}>{order.customerName}</strong>
              {order.customerPhone ? ` • ${order.customerPhone}` : ''}
            </span>
            <span style={{
              fontWeight: 700,
              padding: '3px 10px',
              borderRadius: 'var(--radius-sm)',
              fontSize: '11px',
              backgroundColor: order.paymentStatus === 'paid' ? 'var(--color-primary-light)' : '#FEF3C7',
              color: order.paymentStatus === 'paid' ? 'var(--color-primary)' : '#B45309',
              border: `1px solid ${order.paymentStatus === 'paid' ? '#86EFAC' : '#FCD34D'}`
            }}>
              Tình trạng thanh toán: {order.paymentStatus === 'paid' ? 'Đã thanh toán' : 'Chưa thanh toán'}
            </span>
          </div>
        )}

        {/* Scroll Body */}
        <div style={{ padding: '16px 18px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* Clean Order Status Banner */}
          {isCancelled ? (
            <div style={{
              padding: '12px 14px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: '#FEF2F2',
              border: '1px solid #F87171',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}>
              <span style={{ fontSize: '24px' }}>✕</span>
              <div>
                <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 700, color: '#B91C1C' }}>
                  Đơn hàng đã hủy
                </div>
                <div style={{ fontSize: 'var(--font-size-xs)', color: '#991B1B' }}>
                  {(order as any).cancellationReason || 'Đơn đã được hủy bỏ'}
                </div>
              </div>
            </div>
          ) : isDelivered ? (
            <div style={{
              padding: '12px 14px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--color-primary-light)',
              border: '1px solid var(--color-primary)',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}>
              <span style={{ fontSize: '24px' }}>✓</span>
              <div>
                <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 700, color: 'var(--color-deep)' }}>
                  {isPaid ? 'Giao nước & thanh toán hoàn tất' : 'Đã giao nước tận sân (Chờ thanh toán)'}
                </div>
                <div style={{ fontSize: 'var(--font-size-xs)', color: isPaid ? 'var(--color-text-muted)' : '#B45309', fontWeight: isPaid ? 400 : 600 }}>
                  {isPaid
                    ? 'Cảm ơn bạn đã sử dụng dịch vụ tại Sân Cầu Lông Trần Lựu!'
                    : 'Quý khách vui lòng ghé quầy thu ngân thanh toán sau khi kết thúc lượt đánh nhé!'}
                </div>
              </div>
            </div>
          ) : null}

          {/* Timeline Status */}
          <div style={{
            backgroundColor: 'var(--color-bg)',
            borderRadius: 'var(--radius-md)',
            padding: '14px',
            border: '1px solid var(--color-border)'
          }}>
            <div style={{
              fontSize: 'var(--font-size-xs)',
              fontWeight: 700,
              color: 'var(--color-text-muted)',
              marginBottom: '12px',
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}>
              Tiến trình phục vụ
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {steps.map((step) => {
                const status = getStepStatus(step.key);
                let badgeColor = 'var(--color-text-subtle)';
                let badgeBg = 'var(--color-border)';
                let textColor = 'var(--color-text-muted)';
                const isCurrent = status === 'current';

                if (status === 'completed') {
                  badgeColor = '#FFFFFF';
                  badgeBg = 'var(--color-primary)';
                  textColor = 'var(--color-text-main)';
                } else if (status === 'current') {
                  badgeColor = 'var(--color-accent-text)';
                  badgeBg = 'var(--color-accent)';
                  textColor = 'var(--color-deep)';
                }

                return (
                  <div key={step.key} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                    <div style={{
                      width: '24px',
                      height: '24px',
                      borderRadius: '50%',
                      backgroundColor: badgeBg,
                      color: badgeColor,
                      fontSize: '11px',
                      fontWeight: 800,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      marginTop: '2px'
                    }}>
                      {status === 'completed' ? '✓' : ''}
                    </div>

                    <div style={{ flex: 1 }}>
                      <div style={{
                        fontSize: 'var(--font-size-sm)',
                        fontWeight: isCurrent ? 800 : 600,
                        color: textColor
                      }}>
                        {step.label}
                        {isCurrent && !isDelivered && !isCancelled && (
                          <span style={{
                            marginLeft: '8px',
                            fontSize: '11px',
                            padding: '1px 6px',
                            backgroundColor: 'var(--color-primary-light)',
                            color: 'var(--color-primary)',
                            borderRadius: '4px',
                            fontWeight: 700
                          }}>
                            Đang xử lý
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                        {step.desc}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Items Summary */}
          <div style={{
            backgroundColor: 'var(--color-surface)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--color-border)',
            padding: '14px'
          }}>
            <div style={{
              fontSize: 'var(--font-size-xs)',
              fontWeight: 700,
              color: 'var(--color-text-muted)',
              marginBottom: '8px',
              textTransform: 'uppercase'
            }}>
              Chi tiết món gọi
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {order.items.map((item, idx) => (
                <div key={idx} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: 'var(--font-size-sm)'
                }}>
                  <div>
                    <span style={{ fontWeight: 700, color: 'var(--color-deep)' }}>{item.quantity}x</span>{' '}
                    <span>{item.name}</span>
                  </div>
                  <span style={{ fontWeight: 600 }}>{formatVnd(item.lineTotal)}</span>
                </div>
              ))}

              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                paddingTop: '8px',
                marginTop: '4px',
                borderTop: '1px dashed var(--color-border)',
                fontWeight: 800,
                color: 'var(--color-deep)',
                fontSize: 'var(--font-size-base)'
              }}>
                <span>Tổng thu khi giao:</span>
                <span style={{ color: 'var(--color-primary)' }}>{formatVnd(order.totalVnd)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 18px',
          borderTop: '1px solid var(--color-border)',
          backgroundColor: 'var(--color-surface)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
            Thanh toán trực tiếp cho nhân viên
          </span>
          <button
            onClick={onClose}
            style={{
              padding: '8px 18px',
              backgroundColor: 'var(--color-deep)',
              color: '#FFFFFF',
              borderRadius: 'var(--radius-sm)',
              fontSize: 'var(--font-size-sm)',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
