import React from 'react';
import { Order } from '../types/order';
import { formatVnd } from '../data/mockProducts';

interface AdminOrdersViewProps {
  orders: Order[];
  onAcceptOrder?: (orderId: string) => void;
  onPrepareOrder: (orderId: string) => void;
  onDeliverOrder: (orderId: string) => void;
  onCancelOrder?: (orderId: string) => void;
  onFastForwardOrder?: (orderId: string) => void;
  onOpenCreateOrderModal?: () => void;
}

export const AdminOrdersView: React.FC<AdminOrdersViewProps> = ({
  orders,
  onPrepareOrder,
  onDeliverOrder,
  onCancelOrder,
  onOpenCreateOrderModal
}) => {
  // 3 streamlined columns:
  // 1. Chờ giao: Tất cả đơn mới & đã tiếp nhận cần nhân viên lấy nước
  // 2. Đang mang ra sân: Đơn đang trên đường giao tới sân
  // 3. Đã hoàn tất: Đơn đã giao tận sân và đã thu tiền
  const pendingOrders = orders.filter(o => o.status === 'new' || o.status === 'accepted');
  const deliveringOrders = orders.filter(o => o.status === 'preparing');
  const completedOrders = orders.filter(o => o.status === 'delivered');

  const handleCancelClick = async (orderId: string) => {
    const reason = prompt('Nhập lý do hủy đơn (hoặc bấm OK để xác nhận):', 'Khách đổi ý / hết hàng');
    if (reason === null) return;
    if (onCancelOrder) {
      onCancelOrder(orderId);
    } else {
      try {
        await fetch(`/api/orders/${orderId}/cancel`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason })
        });
        window.location.reload();
      } catch (e) {
        console.error(e);
      }
    }
  };

  const renderOrderCard = (order: Order, type: 'pending' | 'delivering' | 'completed') => {
    const totalBottles = order.items.reduce((s, i) => s + i.quantity, 0);
    const totalIce = order.items.reduce((s, i) => s + i.iceQuantity, 0);

    return (
      <div
        key={order.id}
        style={{
          backgroundColor: 'var(--color-surface)',
          borderRadius: 'var(--radius-lg)',
          border: type === 'pending' ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
          padding: '16px',
          boxShadow: type === 'pending' ? '0 4px 14px rgba(19, 122, 73, 0.12)' : 'var(--shadow-sm)',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px'
        }}
      >
        {/* Court Banner & Time */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingBottom: '10px',
          borderBottom: '1px solid var(--color-border)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{
              backgroundColor: 'var(--color-deep)',
              color: 'var(--color-accent)',
              fontSize: '18px',
              fontWeight: 900,
              padding: '4px 12px',
              borderRadius: 'var(--radius-sm)',
              letterSpacing: '0.5px'
            }}>
              {order.courtName}
            </span>
            <span style={{
              fontSize: 'var(--font-size-xs)',
              fontWeight: 700,
              color: 'var(--color-text-muted)'
            }}>
              {order.displayCode}
            </span>
          </div>

          <div style={{
            fontSize: 'var(--font-size-xs)',
            color: 'var(--color-text-muted)',
            textAlign: 'right',
            fontWeight: 600
          }}>
            {new Date(order.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>

        {/* Highlight Ice and Drinks summary for fast counter glance */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          backgroundColor: 'var(--color-bg)',
          padding: '8px 12px',
          borderRadius: 'var(--radius-sm)'
        }}>
          <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--color-deep)' }}>
            📦 {totalBottles} chai
          </span>
          <span style={{ color: 'var(--color-border-strong)' }}>|</span>
          <span style={{
            fontSize: '13px',
            fontWeight: 800,
            color: totalIce > 0 ? 'var(--color-primary)' : 'var(--color-text-muted)'
          }}>
            🧊 {totalIce} ly đá
          </span>
        </div>

        {/* Detailed Item List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {order.items.map((item, idx) => (
            <div key={idx} style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: 'var(--font-size-sm)'
            }}>
              <div>
                <span style={{ fontWeight: 800, color: 'var(--color-deep)' }}>{item.quantity}x</span>{' '}
                <span style={{ fontWeight: 600 }}>{item.name}</span>
                {item.iceQuantity > 0 && (
                  <span style={{
                    marginLeft: '6px',
                    fontSize: '11px',
                    color: 'var(--color-primary)',
                    backgroundColor: 'var(--color-primary-light)',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    fontWeight: 700
                  }}>
                    +{item.iceQuantity} đá
                  </span>
                )}
              </div>
              <span style={{ fontWeight: 600, color: 'var(--color-text-muted)', fontSize: 'var(--font-size-xs)' }}>
                {formatVnd(item.lineTotal)}
              </span>
            </div>
          ))}
        </div>

        {/* Total to collect */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingTop: '10px',
          borderTop: '1px dashed var(--color-border)',
          fontWeight: 800
        }}>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
            Tổng tiền thu:
          </span>
          <span style={{ fontSize: 'var(--font-size-base)', color: 'var(--color-primary)', fontWeight: 900 }}>
            {formatVnd(order.totalVnd)}
          </span>
        </div>

        {/* Streamlined Action Buttons */}
        <div style={{ marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {type === 'pending' && (
            <>
              {/* 1-Click Fast Delivery & Payment Collection */}
              <button
                onClick={() => onDeliverOrder(order.id)}
                style={{
                  width: '100%',
                  padding: '12px',
                  backgroundColor: 'var(--color-primary)',
                  color: '#FFFFFF',
                  borderRadius: 'var(--radius-md)',
                  fontSize: 'var(--font-size-sm)',
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  boxShadow: '0 2px 8px rgba(19, 122, 73, 0.25)',
                  cursor: 'pointer',
                  border: 'none',
                  transition: 'var(--transition-fast)'
                }}
              >
                <span>✓ ĐÃ GIAO & THU TIỀN ({formatVnd(order.totalVnd)})</span>
              </button>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => onPrepareOrder(order.id)}
                  style={{
                    flex: 1,
                    padding: '8px 10px',
                    backgroundColor: 'var(--color-surface)',
                    color: 'var(--color-deep)',
                    border: '1px solid var(--color-border-strong)',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: 'var(--font-size-xs)',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px'
                  }}
                >
                  <span>→ Mang ra sân</span>
                </button>

                <button
                  onClick={() => handleCancelClick(order.id)}
                  style={{
                    padding: '8px 12px',
                    backgroundColor: '#FEF2F2',
                    color: '#DC2626',
                    border: '1px solid #FCA5A5',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: 'var(--font-size-xs)',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  ✕ Hủy
                </button>
              </div>
            </>
          )}

          {type === 'delivering' && (
            <button
              onClick={() => onDeliverOrder(order.id)}
              style={{
                width: '100%',
                padding: '12px',
                backgroundColor: 'var(--color-primary)',
                color: '#FFFFFF',
                borderRadius: 'var(--radius-md)',
                fontSize: 'var(--font-size-sm)',
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                boxShadow: '0 2px 8px rgba(19, 122, 73, 0.25)',
                cursor: 'pointer',
                border: 'none'
              }}
            >
              <span>✓ ĐÃ GIAO & THU TIỀN ({formatVnd(order.totalVnd)})</span>
            </button>
          )}

          {type === 'completed' && (
            <div style={{
              padding: '8px 12px',
              backgroundColor: 'var(--color-status-delivered-bg)',
              color: 'var(--color-status-delivered)',
              borderRadius: 'var(--radius-sm)',
              fontSize: 'var(--font-size-xs)',
              fontWeight: 800,
              textAlign: 'center'
            }}>
              ✓ Đã giao tận sân • Đã thu tiền
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div style={{ padding: '24px', maxWidth: '1600px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Top Banner Toolbar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: 'var(--color-surface)',
        padding: '16px 24px',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--color-border)',
        boxShadow: 'var(--shadow-sm)',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div>
          <h2 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 800, color: 'var(--color-deep)', margin: 0 }}>
            Điều Hành Đơn Gọi Nước Theo Sân
          </h2>
          <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', margin: '4px 0 0' }}>
            Nhận đơn tức thì không độ trễ. 1-click xác nhận đã giao và thu tiền trực tiếp.
          </p>
        </div>

        {onOpenCreateOrderModal && (
          <button
            onClick={onOpenCreateOrderModal}
            style={{
              padding: '10px 20px',
              backgroundColor: 'var(--color-deep)',
              color: 'var(--color-accent)',
              border: '2px solid var(--color-accent)',
              borderRadius: 'var(--radius-md)',
              fontWeight: 800,
              fontSize: 'var(--font-size-sm)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              cursor: 'pointer',
              boxShadow: 'var(--shadow-sm)'
            }}
          >
            <span>➕ TẠO ORDER CHO SÂN (QUẦY POS)</span>
          </button>
        )}
      </div>

      {/* 3 Practical Columns Layout */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
        gap: '20px',
        alignItems: 'flex-start'
      }}>
        {/* Column 1: ĐƠN CHỜ GIAO */}
        <div style={{
          backgroundColor: 'var(--color-surface-subtle)',
          borderRadius: 'var(--radius-lg)',
          border: pendingOrders.length > 0 ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '20px' }}>🔔</span>
              <h3 style={{ fontSize: 'var(--font-size-base)', fontWeight: 800, color: 'var(--color-deep)', margin: 0 }}>
                1. ĐƠN CHỜ GIAO
              </h3>
            </div>
            <span style={{
              backgroundColor: pendingOrders.length > 0 ? 'var(--color-primary)' : 'var(--color-surface)',
              color: pendingOrders.length > 0 ? '#FFFFFF' : 'var(--color-text-muted)',
              fontSize: '13px',
              fontWeight: 800,
              padding: '2px 10px',
              borderRadius: 'var(--radius-full)'
            }}>
              {pendingOrders.length}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {pendingOrders.length === 0 ? (
              <div style={{
                padding: '40px 10px',
                textAlign: 'center',
                color: 'var(--color-text-muted)',
                fontSize: 'var(--font-size-sm)',
                backgroundColor: 'var(--color-surface)',
                borderRadius: 'var(--radius-md)'
              }}>
                Hiện không có đơn nào chờ phục vụ
              </div>
            ) : (
              pendingOrders.map(order => renderOrderCard(order, 'pending'))
            )}
          </div>
        </div>

        {/* Column 2: ĐANG MANG RA SÂN */}
        <div style={{
          backgroundColor: 'var(--color-surface-subtle)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--color-border)',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '20px' }}>🏃</span>
              <h3 style={{ fontSize: 'var(--font-size-base)', fontWeight: 800, color: 'var(--color-deep)', margin: 0 }}>
                2. ĐANG MANG RA SÂN
              </h3>
            </div>
            <span style={{
              backgroundColor: 'var(--color-surface)',
              color: 'var(--color-text-muted)',
              fontSize: '13px',
              fontWeight: 800,
              padding: '2px 10px',
              borderRadius: 'var(--radius-full)',
              border: '1px solid var(--color-border)'
            }}>
              {deliveringOrders.length}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {deliveringOrders.length === 0 ? (
              <div style={{
                padding: '40px 10px',
                textAlign: 'center',
                color: 'var(--color-text-muted)',
                fontSize: 'var(--font-size-sm)',
                backgroundColor: 'var(--color-surface)',
                borderRadius: 'var(--radius-md)'
              }}>
                Chưa có đơn nào đang trên đường mang ra sân
              </div>
            ) : (
              deliveringOrders.map(order => renderOrderCard(order, 'delivering'))
            )}
          </div>
        </div>

        {/* Column 3: ĐÃ HOÀN TẤT HÔM NAY */}
        <div style={{
          backgroundColor: 'var(--color-surface-subtle)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--color-border)',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '20px' }}>✓</span>
              <h3 style={{ fontSize: 'var(--font-size-base)', fontWeight: 800, color: 'var(--color-deep)', margin: 0 }}>
                3. ĐÃ HOÀN TẤT HÔM NAY
              </h3>
            </div>
            <span style={{
              backgroundColor: 'var(--color-surface)',
              color: 'var(--color-text-muted)',
              fontSize: '13px',
              fontWeight: 800,
              padding: '2px 10px',
              borderRadius: 'var(--radius-full)',
              border: '1px solid var(--color-border)'
            }}>
              {completedOrders.length}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {completedOrders.length === 0 ? (
              <div style={{
                padding: '40px 10px',
                textAlign: 'center',
                color: 'var(--color-text-muted)',
                fontSize: 'var(--font-size-sm)',
                backgroundColor: 'var(--color-surface)',
                borderRadius: 'var(--radius-md)'
              }}>
                Chưa có đơn hoàn tất
              </div>
            ) : (
              completedOrders.map(order => renderOrderCard(order, 'completed'))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
