import React from 'react';
import { Order, OrderStatus } from '../types/order';
import { formatVnd } from '../types/product';

interface OrderHistoryModalProps {
  isOpen: boolean;
  courtCode: string;
  courtName: string;
  orders: Order[];
  onClose: () => void;
  onSelectOrder: (order: Order) => void;
}

const statusConfig: Record<OrderStatus, { label: string; bg: string; color: string; border: string; icon: string }> = {
  new: {
    label: 'Đã nhận đơn',
    bg: '#EFF6FF',
    color: '#1D4ED8',
    border: '#BFDBFE',
    icon: '⚡'
  },
  accepted: {
    label: 'Quầy đã tiếp nhận',
    bg: '#ECFDF5',
    color: '#047857',
    border: '#A7F3D0',
    icon: '✓'
  },
  preparing: {
    label: 'Đang mang ra sân',
    bg: '#FFFBEB',
    color: '#B45309',
    border: '#FDE68A',
    icon: '🛵'
  },
  delivered: {
    label: 'Đã giao tận sân',
    bg: '#F0FDF4',
    color: '#15803D',
    border: '#BBF7D0',
    icon: '✨'
  },
  cancelled: {
    label: 'Quầy đã hủy',
    bg: '#FEF2F2',
    color: '#B91C1C',
    border: '#FECACA',
    icon: '✕'
  }
};

export const OrderHistoryModal: React.FC<OrderHistoryModalProps> = ({
  isOpen,
  courtCode,
  courtName,
  orders,
  onClose,
  onSelectOrder
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

  const totalSpent = orders.reduce((sum, o) => (o.status !== 'cancelled' ? sum + o.totalVnd : sum), 0);
  const activeCount = orders.filter(o => !['delivered', 'cancelled'].includes(o.status)).length;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Đơn hàng của bạn"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(10, 41, 28, 0.65)',
        backdropFilter: 'blur(6px)',
        zIndex: 120,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px'
      }}
      onClick={onClose}
    >
      <div
        className="animate-fade-in"
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '20px',
          boxShadow: '0 20px 40px -10px rgba(18, 67, 46, 0.3)',
          width: '100%',
          maxWidth: '480px',
          maxHeight: '88vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          border: '1px solid rgba(18, 67, 46, 0.12)'
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #E5E7EB',
            backgroundColor: '#FAFAF9',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <h2
                style={{
                  fontSize: '18px',
                  fontWeight: 800,
                  color: 'var(--color-deep, #12432E)',
                  margin: 0
                }}
              >
                Đơn Của Bạn
              </h2>
              <span
                style={{
                  backgroundColor: 'var(--color-deep, #12432E)',
                  color: 'var(--color-accent, #A3E635)',
                  fontSize: '11px',
                  fontWeight: 800,
                  padding: '2px 8px',
                  borderRadius: '12px'
                }}
              >
                {courtName || `Sân ${courtCode}`}
              </span>
            </div>
            <p
              style={{
                fontSize: '12px',
                color: '#6B7280',
                margin: '4px 0 0'
              }}
            >
              Đơn hàng đang chờ phục vụ tại sân
            </p>
          </div>

          <button
            onClick={onClose}
            aria-label="Đóng danh sách"
            style={{
              width: '34px',
              height: '34px',
              borderRadius: '50%',
              backgroundColor: '#F3F4F6',
              border: 'none',
              color: '#4B5563',
              fontSize: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            ✕
          </button>
        </div>

        {/* Scrollable Body */}
        <div
          style={{
            padding: '16px 20px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}
        >
          {orders.length === 0 ? (
            /* Empty State */
            <div
              style={{
                textAlign: 'center',
                padding: '40px 16px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '12px'
              }}
            >
              <div
                style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '50%',
                  backgroundColor: '#F0FDF4',
                  border: '2px dashed #86EFAC',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '28px'
                }}
              >
                🥤
              </div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--color-deep, #12432E)' }}>
                Không có đơn nào đang chờ phục vụ
              </div>
              <p style={{ fontSize: '13px', color: '#6B7280', maxWidth: '320px', margin: 0, lineHeight: 1.4 }}>
                Tất cả các món bạn gọi trước đó tại <strong>{courtName || `Sân ${courtCode}`}</strong> (nếu có) đã được quầy hoàn tất giao tận sân. Bạn có thể chọn thêm nước giải khát bất cứ lúc nào!
              </p>
              <button
                onClick={onClose}
                style={{
                  marginTop: '8px',
                  padding: '10px 20px',
                  backgroundColor: 'var(--color-primary, #0D5C3A)',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '10px',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(13, 92, 58, 0.25)'
                }}
              >
                Chọn nước & Gọi ngay
              </button>
            </div>
          ) : (
            /* Order List */
            orders.map(order => {
              const cfg = statusConfig[order.status] || statusConfig.new;
              const isActive = !['delivered', 'cancelled'].includes(order.status);
              const orderTime = new Date(order.createdAt).toLocaleTimeString('vi-VN', {
                hour: '2-digit',
                minute: '2-digit'
              });

              return (
                <div
                  key={order.id}
                  onClick={() => onSelectOrder(order)}
                  style={{
                    backgroundColor: isActive ? '#F0FDF4' : '#FFFFFF',
                    border: `1.5px solid ${isActive ? '#86EFAC' : '#E5E7EB'}`,
                    borderRadius: '14px',
                    padding: '14px',
                    cursor: 'pointer',
                    transition: 'all 0.18s ease',
                    boxShadow: isActive
                      ? '0 4px 12px rgba(16, 185, 129, 0.12)'
                      : '0 2px 6px rgba(0, 0, 0, 0.03)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px'
                  }}
                >
                  {/* Top: Code & Status */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span
                        style={{
                          fontSize: '14px',
                          fontWeight: 800,
                          color: 'var(--color-deep, #12432E)',
                          letterSpacing: '-0.2px'
                        }}
                      >
                        {order.displayCode}
                      </span>
                      <span style={{ fontSize: '11px', color: '#6B7280' }}>
                        ⏱ {orderTime}
                      </span>
                    </div>

                    <span
                      style={{
                        backgroundColor: cfg.bg,
                        color: cfg.color,
                        border: `1px solid ${cfg.border}`,
                        fontSize: '11px',
                        fontWeight: 700,
                        padding: '3px 8px',
                        borderRadius: '20px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      <span>{cfg.icon}</span>
                      <span>{cfg.label}</span>
                    </span>
                  </div>

                  {/* Customer Info & Payment Status */}
                  {order.customerName && (
                    <div style={{ fontSize: '11px', color: '#4B5563', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>👤 Khách: <strong style={{ color: 'var(--color-deep, #12432E)' }}>{order.customerName}</strong> {order.customerPhone ? `(${order.customerPhone})` : ''}</span>
                      <span style={{
                        fontSize: '10px',
                        fontWeight: 700,
                        padding: '1px 6px',
                        borderRadius: '4px',
                        backgroundColor: order.paymentStatus === 'paid' ? '#DCFCE7' : '#FEF3C7',
                        color: order.paymentStatus === 'paid' ? '#15803D' : '#B45309'
                      }}>
                        {order.paymentStatus === 'paid' ? '✓ Đã thanh toán' : '⏳ Chưa thanh toán'}
                      </span>
                    </div>
                  )}

                  {/* Middle: Items summary */}
                  <div
                    style={{
                      fontSize: '12px',
                      color: '#4B5563',
                      lineHeight: 1.4,
                      backgroundColor: isActive ? 'rgba(255, 255, 255, 0.6)' : '#F9FAFB',
                      padding: '8px 10px',
                      borderRadius: '8px'
                    }}
                  >
                    {order.items.map((item, idx) => (
                      <div key={idx} style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>
                          <strong>{item.quantity}x</strong> {item.name}
                        </span>
                        <span style={{ fontWeight: 600, color: '#374151' }}>
                          {formatVnd(item.lineTotal)}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Bottom: Total & Action button */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      paddingTop: '4px'
                    }}
                  >
                    <div>
                      <span style={{ fontSize: '11px', color: '#6B7280' }}>Tổng cộng: </span>
                      <span
                        style={{
                          fontSize: '14px',
                          fontWeight: 800,
                          color: order.status === 'cancelled' ? '#9CA3AF' : '#0D5C3A',
                          textDecoration: order.status === 'cancelled' ? 'line-through' : 'none'
                        }}
                      >
                        {formatVnd(order.totalVnd)}
                      </span>
                    </div>

                    <button
                      onClick={e => {
                        e.stopPropagation();
                        onSelectOrder(order);
                      }}
                      style={{
                        padding: '6px 12px',
                        backgroundColor: isActive ? '#0D5C3A' : '#F3F4F6',
                        color: isActive ? '#FFFFFF' : '#374151',
                        border: 'none',
                        borderRadius: '8px',
                        fontSize: '12px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      {isActive ? '⚡ Xem tiến trình →' : 'Chi tiết đơn →'}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid #E5E7EB',
            backgroundColor: '#FAFAF9',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '10px'
          }}
        >
          {orders.length > 0 ? (
            <div style={{ fontSize: '12px', color: '#4B5563' }}>
              <span>{orders.length} đơn</span>
              {activeCount > 0 && (
                <span style={{ color: '#0D5C3A', fontWeight: 700, marginLeft: '6px' }}>
                  ({activeCount} đang phục vụ)
                </span>
              )}
              <span style={{ margin: '0 4px' }}>·</span>
              <strong>{formatVnd(totalSpent)}</strong>
            </div>
          ) : (
            <div style={{ fontSize: '12px', color: '#9CA3AF' }}>
              Sân Cầu Lông Trần Lựu
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={onClose}
              style={{
                padding: '7px 16px',
                backgroundColor: 'var(--color-deep, #12432E)',
                border: 'none',
                color: '#FFFFFF',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              Đóng
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
