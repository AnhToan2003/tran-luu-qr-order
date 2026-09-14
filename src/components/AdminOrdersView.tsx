import React, { useState, useMemo } from 'react';
import { Order } from '../types/order';
import { formatVnd } from '../types/product';

interface AdminOrdersViewProps {
  orders: Order[];
  onPrepareOrder: (orderId: string) => void;
  onDeliverOrder: (orderId: string) => void;
  onCancelOrder: (orderId: string, reason: string) => void;
  onUpdatePayment: (orderId: string, paymentStatus: 'paid' | 'unpaid') => void;
  onDeliverWithPayment?: (orderId: string, paymentStatus: 'paid' | 'unpaid') => void;
  onOpenCreateOrderModal?: () => void;
}

export const AdminOrdersView: React.FC<AdminOrdersViewProps> = ({
  orders,
  onPrepareOrder,
  onDeliverOrder,
  onCancelOrder,
  onUpdatePayment,
  onDeliverWithPayment,
  onOpenCreateOrderModal
}) => {
  // Chế độ xem: kanban (4 cột) | pending (chờ nhận) | delivering (mang ra sân) | unpaid (sổ nợ) | completed (hoàn tất)
  const [viewMode, setViewMode] = useState<'kanban' | 'pending' | 'delivering' | 'unpaid' | 'completed' | 'all'>('kanban');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCourtFilter, setSelectedCourtFilter] = useState<string>('all');
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'unpaid' | 'paid'>('all');

  // Cố định chế độ tinh gọn (Compact Mode) để quầy xử lý nhiều đơn gọn gàng, rõ ràng
  const isCompactMode = true;
  const [expandedOrderIds, setExpandedOrderIds] = useState<Set<string>>(new Set());

  const toggleOrderExpand = (orderId: string) => {
    setExpandedOrderIds(prev => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  };

  // Thống kê nhanh toàn bộ quầy hôm nay theo 4 giai đoạn chuẩn
  // 1. Chờ nhận đơn (mới đặt, chờ làm nước)
  const pendingOrdersAll = useMemo(() => orders.filter(o => o.status === 'new' || o.status === 'accepted'), [orders]);
  // 2. Mang ra sân (đang phục vụ ngoài sân & xử lý giao dịch)
  const deliveringOrdersAll = useMemo(() => orders.filter(o => o.status === 'preparing'), [orders]);
  // 3. Sổ nợ: Đã giao nước nhưng chưa thanh toán (khách hẹn trả sau trận)
  const unpaidOrdersAll = useMemo(() => orders.filter(o => o.status === 'delivered' && o.paymentStatus !== 'paid'), [orders]);
  const unpaidTotalVndAll = useMemo(() => unpaidOrdersAll.reduce((s, o) => s + o.totalVnd, 0), [unpaidOrdersAll]);
  // 4. Hoàn tất đơn hàng: Đã giao nước VÀ đã thu tiền thành công
  const completedOrdersAll = useMemo(() => orders.filter(o => o.status === 'delivered' && o.paymentStatus === 'paid'), [orders]);
  const completedTotalVndAll = useMemo(() => completedOrdersAll.reduce((s, o) => s + o.totalVnd, 0), [completedOrdersAll]);

  // Danh sách các sân có mặt trong orders để tạo nút filter nhanh
  const uniqueCourts = useMemo(() => {
    const map = new Map<string, string>();
    for (const o of orders) {
      if (o.courtId && o.courtName) map.set(o.courtId, o.courtName);
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [orders]);

  // Bộ lọc dữ liệu đa năng
  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      // Bỏ qua đơn đã hủy nếu không chọn xem tất cả
      if (o.status === 'cancelled' && viewMode !== 'all') return false;

      // 1. Lọc theo Sân
      if (selectedCourtFilter !== 'all' && o.courtId !== selectedCourtFilter && o.courtName !== selectedCourtFilter) {
        return false;
      }

      // 2. Lọc theo trạng thái thanh toán
      if (paymentFilter === 'unpaid' && o.paymentStatus === 'paid') return false;
      if (paymentFilter === 'paid' && o.paymentStatus !== 'paid') return false;

      // 3. Lọc theo từ khóa tìm kiếm (Tên, SĐT, Mã đơn, Tên sân)
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matchCode = (o.displayCode || '').toLowerCase().includes(q);
        const matchCourt = (o.courtName || '').toLowerCase().includes(q);
        const matchName = (o.customerName || '').toLowerCase().includes(q);
        const matchPhone = (o.customerPhone || '').toLowerCase().includes(q);
        const matchItems = o.items.some(i => i.name.toLowerCase().includes(q));
        if (!matchCode && !matchCourt && !matchName && !matchPhone && !matchItems) {
          return false;
        }
      }

      // 4. Lọc theo View Mode nếu không phải kanban
      if (viewMode === 'pending' && !(o.status === 'new' || o.status === 'accepted')) return false;
      if (viewMode === 'delivering' && o.status !== 'preparing') return false;
      if (viewMode === 'unpaid' && !(o.status === 'delivered' && o.paymentStatus !== 'paid')) return false;
      if (viewMode === 'completed' && !(o.status === 'delivered' && o.paymentStatus === 'paid')) return false;

      return true;
    });
  }, [orders, selectedCourtFilter, paymentFilter, searchQuery, viewMode]);

  // Phân nhóm 4 cột cho chế độ Kanban
  const pendingOrders = useMemo(() => filteredOrders.filter(o => o.status === 'new' || o.status === 'accepted'), [filteredOrders]);
  const deliveringOrders = useMemo(() => filteredOrders.filter(o => o.status === 'preparing'), [filteredOrders]);
  const unpaidOrders = useMemo(() => filteredOrders.filter(o => o.status === 'delivered' && o.paymentStatus !== 'paid'), [filteredOrders]);
  const completedOrders = useMemo(() => filteredOrders.filter(o => o.status === 'delivered' && o.paymentStatus === 'paid'), [filteredOrders]);

  const handleCancelClick = async (orderId: string) => {
    const reason = prompt('Nhập lý do hủy đơn (hoặc bấm OK để xác nhận):', 'Khách đổi ý / Hết hàng');
    if (reason === null) return;
    if (!reason.trim()) return;
    onCancelOrder(orderId, reason.trim());
  };

  // Xử lý giao dịch tại sân: Đã thu tiền (-> Hoàn tất) hoặc Chưa thu tiền (-> Sổ nợ)
  const handleResolveDelivering = (orderId: string, paymentStatus: 'paid' | 'unpaid') => {
    if (onDeliverWithPayment) {
      onDeliverWithPayment(orderId, paymentStatus);
    } else {
      onUpdatePayment(orderId, paymentStatus);
      onDeliverOrder(orderId);
    }
  };

  // Nút hành động nhanh: Giao và Thu tiền ngay (1 chạm tại quầy)
  const handleFastDeliverAndPay = (orderId: string) => {
    if (onDeliverWithPayment) {
      onDeliverWithPayment(orderId, 'paid');
    } else {
      onUpdatePayment(orderId, 'paid');
      onDeliverOrder(orderId);
    }
  };

  // Render thẻ đơn hàng trực quan theo 4 bước điều hành
  const renderOrderCard = (order: Order, _cardContext?: 'pending' | 'delivering' | 'unpaid' | 'completed' | 'all') => {
    const totalBottles = order.items.reduce((s, i) => s + i.quantity, 0);
    const totalIce = order.items.reduce((s, i) => s + i.iceQuantity, 0);
    const isPaid = order.paymentStatus === 'paid';
    const isPending = order.status === 'new' || order.status === 'accepted';
    const isDelivering = order.status === 'preparing';
    const isUnpaidDebt = order.status === 'delivered' && !isPaid;
    const isCompletedPaid = order.status === 'delivered' && isPaid;
    const isExpanded = expandedOrderIds.has(order.id);

    return (
      <div
        key={order.id}
        style={{
          backgroundColor: 'var(--color-surface)',
          borderRadius: 'var(--radius-lg)',
          border: isPending
            ? '2px solid var(--color-primary)'
            : isDelivering
            ? '2px solid #2563EB'
            : isUnpaidDebt
            ? '2px solid #D97706'
            : '1px solid var(--color-border)',
          padding: isCompactMode ? '10px 14px' : '14px 16px',
          boxShadow: isPending
            ? '0 4px 12px rgba(19, 122, 73, 0.10)'
            : isDelivering
            ? '0 4px 12px rgba(37, 99, 235, 0.10)'
            : isUnpaidDebt
            ? '0 4px 12px rgba(217, 119, 6, 0.12)'
            : 'var(--shadow-sm)',
          display: 'flex',
          flexDirection: 'column',
          gap: isCompactMode ? '8px' : '10px',
          transition: 'all 0.15s ease'
        }}
      >
        {/* Court Banner & Display Code & Time */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingBottom: '8px',
          borderBottom: '1px solid var(--color-border)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{
              backgroundColor: isUnpaidDebt ? '#92400E' : isDelivering ? '#1E40AF' : 'var(--color-deep)',
              color: '#FFFFFF',
              fontSize: '15px',
              fontWeight: 800,
              padding: '3px 9px',
              borderRadius: 'var(--radius-sm)',
              letterSpacing: '0.4px'
            }}>
              {order.courtName}
            </span>
            <span style={{
              fontSize: '11px',
              fontWeight: 700,
              color: 'var(--color-text-muted)'
            }}>
              {order.displayCode}
            </span>
          </div>

          <div style={{
            fontSize: '11px',
            color: 'var(--color-text-muted)',
            textAlign: 'right',
            fontWeight: 600
          }}>
            {new Date(order.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>

        {/* Thông tin Khách hàng (Tên & SĐT & Trạng thái thanh toán) */}
        <div style={{
          backgroundColor: isUnpaidDebt ? '#FFFBEB' : 'var(--color-bg)',
          padding: '6px 10px',
          borderRadius: 'var(--radius-sm)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
          border: isUnpaidDebt ? '1px solid #FCD34D' : '1px solid var(--color-border)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
            <div style={{ minWidth: 0, fontSize: '12px' }}>
              <span style={{ color: 'var(--color-text-muted)' }}>Khách: </span>
              <strong style={{ color: 'var(--color-deep)' }}>
                {order.customerName || 'Khách tại sân'}
              </strong>
              {order.customerPhone && (
                <a
                  href={`tel:${order.customerPhone}`}
                  style={{
                    marginLeft: '6px',
                    color: 'var(--color-primary)',
                    fontWeight: 700,
                    textDecoration: 'none'
                  }}
                  title="Gọi cho khách"
                >
                  {order.customerPhone}
                </a>
              )}
            </div>
          </div>

          {/* Huy hiệu thanh toán */}
          <span style={{
            fontSize: '10px',
            fontWeight: 800,
            padding: '2px 7px',
            borderRadius: '4px',
            whiteSpace: 'nowrap',
            backgroundColor: isPaid ? '#DCFCE7' : '#FEF3C7',
            color: isPaid ? '#15803D' : '#B45309',
            border: `1px solid ${isPaid ? '#86EFAC' : '#FCD34D'}`
          }}>
            {isPaid ? 'Đã thu tiền' : 'Chưa thu tiền'}
          </span>
        </div>

        {/* Chế độ gọn (Compact Mode): Tóm tắt 1 dòng & nút mở rộng */}
        {isCompactMode && !isExpanded ? (
          <div style={{
            fontSize: '12px',
            color: 'var(--color-text-main)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
            backgroundColor: 'var(--color-bg)',
            padding: '6px 10px',
            borderRadius: 'var(--radius-sm)'
          }}>
            <div style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              <span style={{ fontWeight: 800, color: 'var(--color-deep)' }}>
                {totalBottles} chai{totalIce > 0 ? ` • ${totalIce} đá` : ''}:
              </span>{' '}
              <span style={{ color: 'var(--color-text-muted)' }}>
                {order.items.map(i => `${i.quantity}x ${i.name}`).join(', ')}
              </span>
            </div>
            <button
              onClick={() => toggleOrderExpand(order.id)}
              style={{
                fontSize: '11px',
                color: 'var(--color-primary)',
                fontWeight: 700,
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                whiteSpace: 'nowrap'
              }}
            >
              Chi tiết ▾
            </button>
          </div>
        ) : (
          /* Chế độ đầy đủ hoặc khi đang mở rộng chi tiết */
          <>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: 'var(--color-bg)',
              padding: '5px 10px',
              borderRadius: 'var(--radius-sm)',
              fontSize: '11px'
            }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                <span style={{ fontWeight: 800, color: 'var(--color-deep)' }}>
                  {totalBottles} chai
                </span>
                <span style={{ color: 'var(--color-border-strong)' }}>|</span>
                <span style={{ fontWeight: 800, color: totalIce > 0 ? 'var(--color-primary)' : 'var(--color-text-muted)' }}>
                  {totalIce} ly đá
                </span>
              </div>
              {isCompactMode && (
                <button
                  onClick={() => toggleOrderExpand(order.id)}
                  style={{
                    fontSize: '11px',
                    color: 'var(--color-text-muted)',
                    fontWeight: 600,
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer'
                  }}
                >
                  Thu gọn ▴
                </button>
              )}
            </div>

            {/* Danh sách từng món chi tiết */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              {order.items.map((item, idx) => (
                <div key={idx} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: 'var(--font-size-xs)'
                }}>
                  <div>
                    <span style={{
                      fontWeight: 800,
                      color: 'var(--color-deep)',
                      backgroundColor: 'var(--color-surface-subtle)',
                      padding: '1px 5px',
                      borderRadius: '3px',
                      marginRight: '4px'
                    }}>
                      {item.quantity}x
                    </span>{' '}
                    <span style={{ fontWeight: 600 }}>{item.name}</span>
                    {item.iceQuantity > 0 && (
                      <span style={{
                        marginLeft: '6px',
                        fontSize: '10px',
                        color: 'var(--color-primary)',
                        backgroundColor: 'var(--color-primary-light)',
                        padding: '1px 5px',
                        borderRadius: '3px',
                        fontWeight: 700
                      }}>
                        +{item.iceQuantity} đá
                      </span>
                    )}
                  </div>
                  <span style={{ fontWeight: 600, color: 'var(--color-text-muted)', fontSize: '11px' }}>
                    {formatVnd(item.lineTotal)}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Tổng tiền thu */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingTop: '6px',
          borderTop: '1px dashed var(--color-border)',
          fontWeight: 800
        }}>
          <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
            Tổng tiền:
          </span>
          <span style={{ fontSize: '16px', color: isPaid ? 'var(--color-primary)' : '#D97706', fontWeight: 900 }}>
            {formatVnd(order.totalVnd)}
          </span>
        </div>

        {/* CÁC NÚT HÀNH ĐỘNG THEO TỪNG BƯỚC ĐIỀU HÀNH */}
        <div style={{ marginTop: '2px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {/* CỘT 1: CHỜ NHẬN ĐƠN */}
          {isPending && (
            <>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  onClick={() => onPrepareOrder(order.id)}
                  style={{
                    flex: 1,
                    padding: '9px 12px',
                    backgroundColor: 'var(--color-deep)',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: 'var(--radius-md)',
                    fontSize: 'var(--font-size-xs)',
                    fontWeight: 800,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: 'var(--shadow-sm)'
                  }}
                >
                  <span>Đem ra sân →</span>
                </button>

                <button
                  onClick={() => handleCancelClick(order.id)}
                  style={{
                    padding: '9px 12px',
                    backgroundColor: '#FEF2F2',
                    color: '#DC2626',
                    border: '1px solid #FCA5A5',
                    borderRadius: 'var(--radius-md)',
                    fontSize: '11px',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                  title="Hủy đơn hàng"
                >
                  Hủy
                </button>
              </div>

              {/* Nút chính 2: Giao & Thu tiền ngay (nếu khách trả tiền luôn tại quầy) */}
              <button
                onClick={() => handleFastDeliverAndPay(order.id)}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  backgroundColor: 'var(--color-primary)',
                  color: '#FFFFFF',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '11px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  border: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <span>Giao & Thu tiền ngay ({formatVnd(order.totalVnd)})</span>
              </button>
            </>
          )}

          {/* CỘT 2: ĐANG MANG RA SÂN • XỬ LÝ GIAO DỊCH (ĐÃ THU / CHƯA THU) */}
          {isDelivering && (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              backgroundColor: '#F0F9FF',
              padding: '8px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid #BAE6FD'
            }}>
              <div style={{
                fontSize: '11px',
                fontWeight: 700,
                color: '#0369A1'
              }}>
                Xác nhận giao dịch tại sân:
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                {/* Lựa chọn 1: ĐÃ THU TIỀN -> Chuyển vào Hoàn tất đơn hàng */}
                <button
                  onClick={() => handleResolveDelivering(order.id, 'paid')}
                  style={{
                    padding: '8px 6px',
                    backgroundColor: '#15803D',
                    color: '#FFFFFF',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '11px',
                    fontWeight: 800,
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '1px'
                  }}
                  title="Khách trả tiền ngay lúc nhận"
                >
                  <span>Đã thu tiền</span>
                </button>

                {/* Lựa chọn 2: CHƯA THU TIỀN */}
                <button
                  onClick={() => handleResolveDelivering(order.id, 'unpaid')}
                  style={{
                    padding: '8px 6px',
                    backgroundColor: '#D97706',
                    color: '#FFFFFF',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '11px',
                    fontWeight: 800,
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                  title="Khách hẹn thanh toán sau"
                >
                  <span>Chưa thu tiền</span>
                </button>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '2px' }}>
                <button
                  onClick={() => handleCancelClick(order.id)}
                  style={{
                    padding: '2px 6px',
                    color: '#DC2626',
                    background: 'none',
                    border: 'none',
                    fontSize: '10px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Hủy đơn
                </button>
              </div>
            </div>
          )}

          {/* CỘT 3: CHƯA THU TIỀN */}
          {isUnpaidDebt && (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              backgroundColor: '#FFFBEB',
              padding: '8px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid #FCD34D'
            }}>
              <div style={{
                fontSize: '11px',
                fontWeight: 800,
                color: '#B45309',
                display: 'flex',
                alignItems: 'center',
                gap: '5px'
              }}>
                <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: '#D97706' }} />
                <span>Chưa thu tiền</span>
              </div>

              {/* Nút bấm để hoàn tất thu tiền */}
              <button
                onClick={() => onUpdatePayment(order.id, 'paid')}
                style={{
                  width: '100%',
                  padding: '9px 10px',
                  backgroundColor: '#15803D',
                  color: '#FFFFFF',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '12px',
                  fontWeight: 800,
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px'
                }}
                title="Xác nhận khách đã thanh toán -> Chuyển sang Đã thu tiền"
              >
                <span>Đã thanh toán ({formatVnd(order.totalVnd)})</span>
              </button>
            </div>
          )}

          {/* CỘT 4: ĐÃ THU TIỀN */}
          {isCompletedPaid && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: '#F0FDF4',
              padding: '8px 12px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid #BBF7D0'
            }}>
              <div style={{
                color: '#15803D',
                fontSize: '11px',
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#15803D' }} />
                <span>Đã thu tiền</span>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div style={{ padding: '20px 24px', maxWidth: '1600px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>

      {/* 1. THANH THỐNG KÊ LIVE (TOP STATS KPI) */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: '12px'
      }}>
        {/* Tổng đơn */}
        <div
          onClick={() => setViewMode('kanban')}
          style={{
            backgroundColor: 'var(--color-surface)',
            padding: '12px 16px',
            borderRadius: 'var(--radius-md)',
            border: viewMode === 'kanban' ? '2px solid var(--color-deep)' : '1px solid var(--color-border)',
            cursor: 'pointer',
            boxShadow: 'var(--shadow-sm)',
            transition: 'all 0.15s ease'
          }}
        >
          <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontWeight: 700, letterSpacing: '0.5px' }}>
            TỔNG ĐƠN HÔM NAY
          </div>
          <div style={{ fontSize: '22px', fontWeight: 900, color: 'var(--color-deep)', marginTop: '2px' }}>
            {orders.filter(o => o.status !== 'cancelled').length} <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-muted)' }}>đơn</span>
          </div>
        </div>

        {/* 1. Chờ nhận đơn */}
        <div
          onClick={() => setViewMode('pending')}
          style={{
            backgroundColor: 'var(--color-surface)',
            padding: '12px 16px',
            borderRadius: 'var(--radius-md)',
            border: viewMode === 'pending' ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
            cursor: 'pointer',
            boxShadow: 'var(--shadow-sm)',
            transition: 'all 0.15s ease'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--color-text-muted)', fontWeight: 700, letterSpacing: '0.5px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--color-primary)' }} />
            <span>1. CHỜ NHẬN ĐƠN</span>
          </div>
          <div style={{ fontSize: '22px', fontWeight: 900, color: 'var(--color-primary)', marginTop: '2px' }}>
            {pendingOrdersAll.length} <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-muted)' }}>đơn</span>
          </div>
        </div>

        {/* 2. Mang ra sân */}
        <div
          onClick={() => setViewMode('delivering')}
          style={{
            backgroundColor: 'var(--color-surface)',
            padding: '12px 16px',
            borderRadius: 'var(--radius-md)',
            border: viewMode === 'delivering' ? '2px solid #2563EB' : '1px solid var(--color-border)',
            cursor: 'pointer',
            boxShadow: 'var(--shadow-sm)',
            transition: 'all 0.15s ease'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--color-text-muted)', fontWeight: 700, letterSpacing: '0.5px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#2563EB' }} />
            <span>2. MANG RA SÂN</span>
          </div>
          <div style={{ fontSize: '22px', fontWeight: 900, color: '#2563EB', marginTop: '2px' }}>
            {deliveringOrdersAll.length} <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-muted)' }}>đơn</span>
          </div>
        </div>

        {/* 3. SỔ NỢ: CHƯA THU TIỀN (NỔI BẬT CẦN THU) */}
        <div
          onClick={() => setViewMode('unpaid')}
          style={{
            backgroundColor: '#FFFBEB',
            padding: '12px 16px',
            borderRadius: 'var(--radius-md)',
            border: viewMode === 'unpaid' ? '2px solid #D97706' : '1px solid #FCD34D',
            cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(217, 119, 6, 0.12)',
            transition: 'all 0.15s ease'
          }}
          title="Bấm để xem danh sách các đơn chưa thanh toán"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#B45309', fontWeight: 800, letterSpacing: '0.5px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#D97706' }} />
            <span>3. CHƯA THU TIỀN</span>
          </div>
          <div style={{ fontSize: '22px', fontWeight: 900, color: '#B45309', marginTop: '2px' }}>
            {formatVnd(unpaidTotalVndAll)}
          </div>
          <div style={{ fontSize: '11px', color: '#D97706', fontWeight: 700 }}>
            {unpaidOrdersAll.length} đơn chưa thu tiền
          </div>
        </div>

        {/* 4. ĐÃ THU TIỀN */}
        <div
          onClick={() => setViewMode('completed')}
          style={{
            backgroundColor: '#F0FDF4',
            padding: '12px 16px',
            borderRadius: 'var(--radius-md)',
            border: viewMode === 'completed' ? '2px solid #16A34A' : '1px solid #BBF7D0',
            cursor: 'pointer',
            boxShadow: 'var(--shadow-sm)',
            transition: 'all 0.15s ease'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#15803D', fontWeight: 800, letterSpacing: '0.5px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#16A34A' }} />
            <span>4. ĐÃ THU TIỀN</span>
          </div>
          <div style={{ fontSize: '22px', fontWeight: 900, color: '#15803D', marginTop: '2px' }}>
            {formatVnd(completedTotalVndAll)}
          </div>
          <div style={{ fontSize: '11px', color: '#16A34A', fontWeight: 600 }}>
            {completedOrdersAll.length} đơn đã thu tiền
          </div>
        </div>
      </div>

      {/* 2. THANH CÔNG CỤ TÌM KIẾM, BỘ LỌC & TẠO ĐƠN TẠI QUẦY */}
      <div style={{
        backgroundColor: 'var(--color-surface)',
        padding: '12px 16px',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--color-border)',
        boxShadow: 'var(--shadow-sm)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        {/* Nhóm Bộ Lọc & Tìm Kiếm */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', flex: 1 }}>
          {/* Ô tìm kiếm tức thì */}
          <div style={{ flex: '1 1 220px', position: 'relative' }}>
            <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '12px', color: 'var(--color-text-muted)' }}>
              Tìm:
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Nhập tên khách, SĐT, mã đơn, số sân..."
              style={{
                width: '100%',
                padding: '8px 12px 8px 42px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--color-border)',
                fontSize: 'var(--font-size-xs)',
                backgroundColor: 'var(--color-bg)',
                outline: 'none'
              }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                style={{
                  position: 'absolute',
                  right: '8px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: 'var(--color-text-muted)',
                  cursor: 'pointer',
                  fontWeight: 700
                }}
              >
                ✕
              </button>
            )}
          </div>

          {/* Lọc theo Sân */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-text-muted)' }}>SÂN:</span>
            <select
              value={selectedCourtFilter}
              onChange={e => setSelectedCourtFilter(e.target.value)}
              style={{
                padding: '7px 10px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--color-border)',
                fontSize: 'var(--font-size-xs)',
                fontWeight: 700,
                backgroundColor: 'var(--color-bg)',
                color: 'var(--color-deep)'
              }}
            >
              <option value="all">Tất cả sân ({orders.length})</option>
              {uniqueCourts.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Lọc theo thanh toán */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-text-muted)' }}>THANH TOÁN:</span>
            <select
              value={paymentFilter}
              onChange={e => setPaymentFilter(e.target.value as any)}
              style={{
                padding: '7px 10px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--color-border)',
                fontSize: 'var(--font-size-xs)',
                fontWeight: 700,
                backgroundColor: 'var(--color-bg)',
                color: paymentFilter === 'unpaid' ? '#B45309' : paymentFilter === 'paid' ? '#15803D' : 'var(--color-deep)'
              }}
            >
              <option value="all">Tất cả trạng thái</option>
              <option value="unpaid">Chưa thu tiền</option>
              <option value="paid">Đã thu tiền</option>
            </select>
          </div>

          {/* Reset filter nếu đang lọc */}
          {(selectedCourtFilter !== 'all' || paymentFilter !== 'all' || searchQuery) && (
            <button
              onClick={() => {
                setSelectedCourtFilter('all');
                setPaymentFilter('all');
                setSearchQuery('');
              }}
              style={{
                padding: '6px 10px',
                backgroundColor: '#F3F4F6',
                color: '#4B5563',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              ✕ Xóa lọc
            </button>
          )}
        </div>

        {/* Nút Tạo Đơn Tại Quầy (POS) */}
        {onOpenCreateOrderModal && (
          <button
            onClick={onOpenCreateOrderModal}
            style={{
              padding: '9px 18px',
              backgroundColor: 'var(--color-deep)',
              color: 'var(--color-accent)',
              border: '1.5px solid var(--color-accent)',
              borderRadius: 'var(--radius-sm)',
              fontWeight: 800,
              fontSize: 'var(--font-size-xs)',
              letterSpacing: '0.4px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer',
              whiteSpace: 'nowrap'
            }}
          >
            <span>+ TẠO ĐƠN TẠI QUẦY</span>
          </button>
        )}
      </div>

      {/* 3. NỘI DUNG CHÍNH (KANBAN 4 CỘT HOẶC DANH SÁCH LỌC) */}
      {viewMode === 'kanban' ? (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))',
          gap: '16px',
          alignItems: 'flex-start'
        }}>
          {/* CỘT 1: CHỜ NHẬN ĐƠN */}
          <div style={{
            backgroundColor: 'var(--color-surface-subtle)',
            borderRadius: 'var(--radius-lg)',
            border: pendingOrders.length > 0 ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: '9px', height: '9px', borderRadius: '50%', backgroundColor: 'var(--color-primary)' }} />
                <div>
                  <h3 style={{ fontSize: 'var(--font-size-base)', fontWeight: 800, color: 'var(--color-deep)', margin: 0 }}>
                    1. CHỜ NHẬN ĐƠN
                  </h3>
                  <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontWeight: 600 }}>
                    Khách vừa đặt, chuẩn bị nước
                  </div>
                </div>
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
                  padding: '36px 10px',
                  textAlign: 'center',
                  color: 'var(--color-text-muted)',
                  fontSize: 'var(--font-size-xs)',
                  backgroundColor: 'var(--color-surface)',
                  borderRadius: 'var(--radius-md)'
                }}>
                  Không có đơn nào chờ nhận
                </div>
              ) : (
                pendingOrders.map(order => renderOrderCard(order, 'pending'))
              )}
            </div>
          </div>

          {/* CỘT 2: MANG RA SÂN & XỬ LÝ GIAO DỊCH */}
          <div style={{
            backgroundColor: 'var(--color-surface-subtle)',
            borderRadius: 'var(--radius-lg)',
            border: deliveringOrders.length > 0 ? '2px solid #2563EB' : '1px solid var(--color-border)',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: '9px', height: '9px', borderRadius: '50%', backgroundColor: '#2563EB' }} />
                <div>
                  <h3 style={{ fontSize: 'var(--font-size-base)', fontWeight: 800, color: 'var(--color-deep)', margin: 0 }}>
                    2. MANG RA SÂN
                  </h3>
                  <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontWeight: 600 }}>
                    Đem nước ra sân & chọn hình thức thu
                  </div>
                </div>
              </div>
              <span style={{
                backgroundColor: deliveringOrders.length > 0 ? '#2563EB' : 'var(--color-surface)',
                color: deliveringOrders.length > 0 ? '#FFFFFF' : 'var(--color-text-muted)',
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
                  padding: '36px 10px',
                  textAlign: 'center',
                  color: 'var(--color-text-muted)',
                  fontSize: 'var(--font-size-xs)',
                  backgroundColor: 'var(--color-surface)',
                  borderRadius: 'var(--radius-md)'
                }}>
                  Chưa có đơn nào đang mang ra sân
                </div>
              ) : (
                deliveringOrders.map(order => renderOrderCard(order, 'delivering'))
              )}
            </div>
          </div>

          {/* CỘT 3: CHƯA THU TIỀN */}
          <div style={{
            backgroundColor: '#FFFDF5',
            borderRadius: 'var(--radius-lg)',
            border: unpaidOrders.length > 0 ? '2px solid #D97706' : '1px solid #FCD34D',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: '9px', height: '9px', borderRadius: '50%', backgroundColor: '#D97706' }} />
                <div>
                  <h3 style={{ fontSize: 'var(--font-size-base)', fontWeight: 800, color: '#B45309', margin: 0 }}>
                    3. CHƯA THU TIỀN
                  </h3>
                  <div style={{ fontSize: '11px', color: '#D97706', fontWeight: 700 }}>
                    Chưa thu: {formatVnd(unpaidOrders.reduce((s, o) => s + o.totalVnd, 0))}
                  </div>
                </div>
              </div>
              <span style={{
                backgroundColor: unpaidOrders.length > 0 ? '#D97706' : '#FEF3C7',
                color: unpaidOrders.length > 0 ? '#FFFFFF' : '#B45309',
                fontSize: '13px',
                fontWeight: 800,
                padding: '2px 10px',
                borderRadius: 'var(--radius-full)',
                border: '1px solid #FCD34D'
              }}>
                {unpaidOrders.length}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {unpaidOrders.length === 0 ? (
                <div style={{
                  padding: '36px 10px',
                  textAlign: 'center',
                  color: '#92400E',
                  fontSize: 'var(--font-size-xs)',
                  backgroundColor: '#FEF3C7',
                  borderRadius: 'var(--radius-md)',
                  fontWeight: 600
                }}>
                  Chưa có đơn nào chưa thu tiền
                </div>
              ) : (
                unpaidOrders.map(order => renderOrderCard(order, 'unpaid'))
              )}
            </div>
          </div>

          {/* CỘT 4: ĐÃ THU TIỀN */}
          <div style={{
            backgroundColor: 'var(--color-surface-subtle)',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--color-border)',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: '9px', height: '9px', borderRadius: '50%', backgroundColor: '#16A34A' }} />
                <div>
                  <h3 style={{ fontSize: 'var(--font-size-base)', fontWeight: 800, color: 'var(--color-deep)', margin: 0 }}>
                    4. ĐÃ THU TIỀN
                  </h3>
                  <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontWeight: 600 }}>
                    Đã giao & thu tiền
                  </div>
                </div>
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
                  padding: '36px 10px',
                  textAlign: 'center',
                  color: 'var(--color-text-muted)',
                  fontSize: 'var(--font-size-xs)',
                  backgroundColor: 'var(--color-surface)',
                  borderRadius: 'var(--radius-md)'
                }}>
                  Chưa có đơn đã thu tiền
                </div>
              ) : (
                completedOrders.map(order => renderOrderCard(order, 'completed'))
              )}
            </div>
          </div>
        </div>
      ) : (
        /* CHẾ ĐỘ XEM TAB RIÊNG BIỆT (Ví dụ: Tab Sổ nợ, Tab Chờ nhận...) */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Header thông báo chế độ xem riêng */}
          <div style={{
            padding: '12px 16px',
            backgroundColor: viewMode === 'unpaid' ? '#FEF3C7' : 'var(--color-surface)',
            border: `1px solid ${viewMode === 'unpaid' ? '#F59E0B' : 'var(--color-border)'}`,
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '8px'
          }}>
            <div style={{ fontWeight: 800, fontSize: 'var(--font-size-sm)', color: viewMode === 'unpaid' ? '#B45309' : 'var(--color-deep)' }}>
              {viewMode === 'unpaid' && `DANH SÁCH ${filteredOrders.length} ĐƠN CHƯA THU TIỀN (Chưa thu: ${formatVnd(filteredOrders.reduce((s, o) => s + o.totalVnd, 0))})`}
              {viewMode === 'pending' && `DANH SÁCH ${filteredOrders.length} ĐƠN CHỜ NHẬN & PHA NƯỚC`}
              {viewMode === 'delivering' && `DANH SÁCH ${filteredOrders.length} ĐƠN ĐANG MANG RA SÂN & XỬ LÝ GIAO DỊCH`}
              {viewMode === 'completed' && `DANH SÁCH ${filteredOrders.length} ĐƠN ĐÃ THU TIỀN (Tổng thu: ${formatVnd(filteredOrders.reduce((s, o) => s + o.totalVnd, 0))})`}
              {viewMode === 'all' && `DANH SÁCH TOÀN BỘ ${filteredOrders.length} ĐƠN HÀNG HÔM NAY`}
            </div>
            <button
              onClick={() => setViewMode('kanban')}
              style={{
                fontSize: '11px',
                fontWeight: 700,
                padding: '6px 12px',
                backgroundColor: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer'
              }}
            >
              ← Quay lại Bảng 4 cột
            </button>
          </div>

          {filteredOrders.length === 0 ? (
            <div style={{
              padding: '60px 20px',
              textAlign: 'center',
              backgroundColor: 'var(--color-surface)',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text-muted)'
            }}>
              <p style={{ fontSize: '16px', fontWeight: 700 }}>Không có đơn nào khớp với bộ lọc hiện tại</p>
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
              gap: '16px'
            }}>
              {filteredOrders.map(order => renderOrderCard(order, viewMode as any))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
