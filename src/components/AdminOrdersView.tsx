import React, { useState, useMemo } from 'react';
import { Order } from '../types/order';
import { formatVnd } from '../types/product';

interface AdminOrdersViewProps {
  orders: Order[];
  onPrepareOrder: (orderId: string) => void;
  onDeliverOrder: (orderId: string) => void;
  onCancelOrder: (orderId: string, reason: string) => void;
  onUpdatePayment: (orderId: string, paymentStatus: 'paid' | 'unpaid', paymentMethod?: 'cash' | 'transfer') => void;
  onDeliverWithPayment?: (orderId: string, paymentStatus: 'paid' | 'unpaid', paymentMethod?: 'cash' | 'transfer') => void;
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
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'unpaid' | 'paid' | 'cash' | 'transfer'>('all');

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
  const pendingOrdersAll = useMemo(() => orders.filter(o => o.orderType !== 'sports_pos' && (o.status === 'new' || o.status === 'accepted')), [orders]);
  // 2. Mang ra sân (đang phục vụ ngoài sân & xử lý giao dịch)
  const deliveringOrdersAll = useMemo(() => orders.filter(o => o.orderType !== 'sports_pos' && o.status === 'preparing'), [orders]);
  // 3. Sổ nợ: Đã giao nước nhưng chưa thanh toán (khách hẹn trả sau trận)
  const unpaidOrdersAll = useMemo(() => orders.filter(o => o.orderType !== 'sports_pos' && o.status === 'delivered' && o.paymentStatus !== 'paid'), [orders]);
  const unpaidTotalVndAll = useMemo(() => unpaidOrdersAll.reduce((s, o) => s + o.totalVnd, 0), [unpaidOrdersAll]);
  // 4. Hoàn tất đơn hàng: Đã giao nước VÀ đã thu tiền thành công
  const completedOrdersAll = useMemo(() => orders.filter(o => o.orderType !== 'sports_pos' && o.status === 'delivered' && o.paymentStatus === 'paid'), [orders]);
  const completedTotalVndAll = useMemo(() => completedOrdersAll.reduce((s, o) => s + o.totalVnd, 0), [completedOrdersAll]);

  // Danh sách các sân có mặt trong orders để tạo nút filter nhanh
  const uniqueCourts = useMemo(() => {
    const map = new Map<string, string>();
    for (const o of orders) {
      if (o.orderType !== 'sports_pos' && o.courtId && o.courtName) map.set(o.courtId, o.courtName);
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [orders]);

  // Bộ lọc dữ liệu đa năng
  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      // Loại trừ hoàn toàn đơn bán hàng thể thao khỏi quầy nước
      if (o.orderType === 'sports_pos') return false;

      // Bỏ qua đơn đã hủy nếu không chọn xem tất cả
      if (o.status === 'cancelled' && viewMode !== 'all') return false;

      // 1. Lọc theo Sân
      if (selectedCourtFilter !== 'all' && o.courtId !== selectedCourtFilter && o.courtName !== selectedCourtFilter) {
        return false;
      }

      // 2. Lọc theo trạng thái thanh toán
      if (paymentFilter === 'unpaid' && o.paymentStatus === 'paid') return false;
      if (paymentFilter === 'paid' && o.paymentStatus !== 'paid') return false;
      if (paymentFilter === 'cash' && !(o.paymentStatus === 'paid' && (o.paymentMethod === 'cash' || !o.paymentMethod))) return false;
      if (paymentFilter === 'transfer' && !(o.paymentStatus === 'paid' && o.paymentMethod === 'transfer')) return false;

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

  // Xử lý giao dịch tại sân: Đã thu tiền mặt / chuyển khoản (-> Hoàn tất) hoặc Chưa thu tiền (-> Sổ nợ)
  const handleResolveDelivering = (orderId: string, paymentStatus: 'paid' | 'unpaid', paymentMethod?: 'cash' | 'transfer') => {
    if (onDeliverWithPayment) {
      onDeliverWithPayment(orderId, paymentStatus, paymentMethod);
    } else {
      onUpdatePayment(orderId, paymentStatus, paymentMethod);
      onDeliverOrder(orderId);
    }
  };

  // Render thẻ đơn hàng trực quan theo 4 bước điều hành
  const renderOrderCard = (order: Order, _cardContext?: 'pending' | 'delivering' | 'unpaid' | 'completed' | 'all') => {
    const totalBottles = order.items.reduce((s, i) => s + i.quantity, 0);
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
              fontWeight: 900,
              padding: '4px 10px',
              borderRadius: 'var(--radius-sm)',
              letterSpacing: '0.4px'
            }}>
              {order.courtName}
            </span>
            <span style={{
              fontSize: '13px',
              fontWeight: 800,
              color: '#0F172A',
              backgroundColor: '#F1F5F9',
              padding: '2px 7px',
              borderRadius: '4px',
              border: '1px solid #CBD5E1',
              letterSpacing: '0.3px'
            }}>
              {order.displayCode}
            </span>
          </div>

          <div style={{
            fontSize: '13px',
            color: '#1E293B',
            textAlign: 'right',
            fontWeight: 700
          }}>
            {new Date(order.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>

        {/* Thông tin Khách hàng (Tên & SĐT & Trạng thái thanh toán) */}
        <div style={{
          backgroundColor: isUnpaidDebt ? '#FFFBEB' : 'var(--color-bg)',
          padding: '8px 12px',
          borderRadius: 'var(--radius-sm)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
          border: isUnpaidDebt ? '1.5px solid #F59E0B' : '1px solid var(--color-border)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
            <div style={{ minWidth: 0, fontSize: '13px' }}>
              <span style={{ color: '#334155', fontWeight: 700 }}>Khách: </span>
              <strong style={{ color: '#0F172A', fontWeight: 800 }}>
                {order.customerName || 'Khách tại sân'}
              </strong>
              {order.customerPhone && (
                <a
                  href={`tel:${order.customerPhone}`}
                  style={{
                    marginLeft: '8px',
                    color: 'var(--color-primary)',
                    fontWeight: 800,
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
            fontSize: '12px',
            fontWeight: 800,
            padding: '3px 9px',
            borderRadius: '6px',
            whiteSpace: 'nowrap',
            backgroundColor: isPaid ? '#DCFCE7' : '#FEF3C7',
            color: isPaid ? '#15803D' : '#92400E',
            border: `1.5px solid ${isPaid ? '#86EFAC' : '#F59E0B'}`
          }}>
            {isPaid ? 'Đã thu tiền' : 'Chưa thu tiền'}
          </span>
        </div>

        {/* Chế độ gọn (Compact Mode): Tóm tắt 1 dòng & nút mở rộng */}
        {isCompactMode && !isExpanded ? (
          <div style={{
            fontSize: '13px',
            color: '#0F172A',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
            backgroundColor: 'var(--color-bg)',
            padding: '8px 12px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--color-border)'
          }}>
            <div style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              <span style={{ fontWeight: 800, color: 'var(--color-deep)' }}>
                {totalBottles} món:
              </span>{' '}
              <span style={{ color: '#1E293B', fontWeight: 600 }}>
                {order.items.map(i => `${i.quantity}x ${i.name}`).join(', ')}
              </span>
            </div>
            <button
              onClick={() => toggleOrderExpand(order.id)}
              style={{
                fontSize: '12px',
                color: 'var(--color-primary)',
                fontWeight: 800,
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
              padding: '6px 12px',
              borderRadius: 'var(--radius-sm)',
              fontSize: '12px',
              border: '1px solid var(--color-border)'
            }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                <span style={{ fontWeight: 800, color: 'var(--color-deep)' }}>
                  {totalBottles} món
                </span>
              </div>
              {isCompactMode && (
                <button
                  onClick={() => toggleOrderExpand(order.id)}
                  style={{
                    fontSize: '12px',
                    color: '#334155',
                    fontWeight: 700,
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {order.items.map((item, idx) => (
                <div key={idx} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: '13px'
                }}>
                  <div>
                    <span style={{
                      fontWeight: 900,
                      color: '#0F172A',
                      backgroundColor: 'var(--color-surface-subtle)',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      marginRight: '6px',
                      border: '1px solid var(--color-border)'
                    }}>
                      {item.quantity}x
                    </span>{' '}
                    <span style={{ fontWeight: 700, color: '#0F172A' }}>{item.name}</span>
                  </div>
                  <span style={{ fontWeight: 800, color: '#0F172A', fontSize: '13px' }}>
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
          paddingTop: '8px',
          borderTop: '1.5px dashed var(--color-border-strong)',
          fontWeight: 800
        }}>
          <span style={{ fontSize: '12px', color: '#1E293B', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
            Tổng tiền:
          </span>
          <span style={{ fontSize: '18px', color: isPaid ? 'var(--color-primary)' : '#B45309', fontWeight: 900 }}>
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
                    padding: '10px 14px',
                    backgroundColor: 'var(--color-deep)',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: 'var(--radius-md)',
                    fontSize: '13px',
                    fontWeight: 900,
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
                    padding: '10px 14px',
                    backgroundColor: '#FEF2F2',
                    color: '#DC2626',
                    border: '1.5px solid #FCA5A5',
                    borderRadius: 'var(--radius-md)',
                    fontSize: '12px',
                    fontWeight: 800,
                    cursor: 'pointer'
                  }}
                  title="Hủy đơn hàng"
                >
                  Hủy
                </button>
              </div>
            </>
          )}

          {/* CỘT 2: ĐANG MANG RA SÂN • XỬ LÝ GIAO DỊCH (ĐÃ THU / CHƯA THU) */}
          {isDelivering && (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              backgroundColor: '#F0F9FF',
              padding: '10px',
              borderRadius: 'var(--radius-md)',
              border: '1.5px solid #BAE6FD'
            }}>
              <div style={{
                fontSize: '12px',
                fontWeight: 800,
                color: '#0369A1'
              }}>
                Xác nhận giao dịch tại sân:
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                {/* Lựa chọn 1A: ĐÃ THU TIỀN MẶT */}
                <button
                  onClick={() => handleResolveDelivering(order.id, 'paid', 'cash')}
                  style={{
                    padding: '9px 6px',
                    backgroundColor: '#15803D',
                    color: '#FFFFFF',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '12px',
                    fontWeight: 900,
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    textAlign: 'center'
                  }}
                  title="Khách trả tiền mặt ngay lúc nhận"
                >
                  <span>Đã thu tiền mặt</span>
                </button>

                {/* Lựa chọn 1B: THU TIỀN CHUYỂN KHOẢN */}
                <button
                  onClick={() => handleResolveDelivering(order.id, 'paid', 'transfer')}
                  style={{
                    padding: '9px 6px',
                    backgroundColor: '#0284C7',
                    color: '#FFFFFF',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '12px',
                    fontWeight: 900,
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    textAlign: 'center'
                  }}
                  title="Khách quét mã chuyển khoản tại sân"
                >
                  <span>Thu chuyển khoản</span>
                </button>
              </div>

              {/* Lựa chọn 2: CHƯA THU TIỀN */}
              <button
                onClick={() => handleResolveDelivering(order.id, 'unpaid')}
                style={{
                  width: '100%',
                  padding: '9px 8px',
                  backgroundColor: '#D97706',
                  color: '#FFFFFF',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '12px',
                  fontWeight: 900,
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
                title="Khách hẹn thanh toán sau (Ghi nợ quầy)"
              >
                <span>Chưa thu tiền</span>
              </button>

              <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '2px' }}>
                <button
                  onClick={() => handleCancelClick(order.id)}
                  style={{
                    padding: '3px 8px',
                    color: '#DC2626',
                    background: 'none',
                    border: 'none',
                    fontSize: '11px',
                    fontWeight: 700,
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
              gap: '8px',
              backgroundColor: '#FFFBEB',
              padding: '10px',
              borderRadius: 'var(--radius-md)',
              border: '1.5px solid #FCD34D'
            }}>
              <div style={{
                fontSize: '12px',
                fontWeight: 900,
                color: '#92400E',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#D97706' }} />
                <span>Chưa thu tiền ({formatVnd(order.totalVnd)})</span>
              </div>

              {/* Lựa chọn thu tiền: Tiền mặt hoặc Chuyển khoản */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                <button
                  onClick={() => onUpdatePayment(order.id, 'paid', 'cash')}
                  style={{
                    padding: '9px 6px',
                    backgroundColor: '#15803D',
                    color: '#FFFFFF',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '12px',
                    fontWeight: 900,
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                  title="Xác nhận khách đã trả tiền mặt"
                >
                  <span>Thu tiền mặt</span>
                </button>

                <button
                  onClick={() => onUpdatePayment(order.id, 'paid', 'transfer')}
                  style={{
                    padding: '9px 6px',
                    backgroundColor: '#0284C7',
                    color: '#FFFFFF',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '12px',
                    fontWeight: 900,
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                  title="Xác nhận khách đã chuyển khoản"
                >
                  <span>Thu CK</span>
                </button>
              </div>
            </div>
          )}

          {/* CỘT 4: ĐÃ THU TIỀN */}
          {isCompletedPaid && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: '#F0FDF4',
              padding: '10px 14px',
              borderRadius: 'var(--radius-sm)',
              border: '1.5px solid #86EFAC'
            }}>
              <div style={{
                color: '#15803D',
                fontSize: '12px',
                fontWeight: 900,
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}>
                <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: '#15803D' }} />
                <span>Đã thu tiền ({order.paymentMethod === 'transfer' ? 'Chuyển khoản' : 'Tiền mặt'})</span>
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
          <div style={{ fontSize: '12px', color: '#1E293B', fontWeight: 800, letterSpacing: '0.5px' }}>
            TỔNG ĐƠN HÔM NAY
          </div>
          <div style={{ fontSize: '24px', fontWeight: 900, color: 'var(--color-deep)', marginTop: '2px' }}>
            {orders.filter(o => o.status !== 'cancelled').length} <span style={{ fontSize: '13px', fontWeight: 700, color: '#334155' }}>đơn</span>
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--color-primary)', fontWeight: 800, letterSpacing: '0.5px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--color-primary)' }} />
            <span>1. CHỜ NHẬN ĐƠN</span>
          </div>
          <div style={{ fontSize: '24px', fontWeight: 900, color: 'var(--color-primary)', marginTop: '2px' }}>
            {pendingOrdersAll.length} <span style={{ fontSize: '13px', fontWeight: 700, color: '#334155' }}>đơn</span>
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#2563EB', fontWeight: 800, letterSpacing: '0.5px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#2563EB' }} />
            <span>2. MANG RA SÂN</span>
          </div>
          <div style={{ fontSize: '24px', fontWeight: 900, color: '#2563EB', marginTop: '2px' }}>
            {deliveringOrdersAll.length} <span style={{ fontSize: '13px', fontWeight: 700, color: '#334155' }}>đơn</span>
          </div>
        </div>

        {/* 3. SỔ NỢ: CHƯA THU TIỀN (NỔI BẬT CẦN THU) */}
        <div
          onClick={() => setViewMode('unpaid')}
          style={{
            backgroundColor: '#FFFBEB',
            padding: '12px 16px',
            borderRadius: 'var(--radius-md)',
            border: viewMode === 'unpaid' ? '2px solid #D97706' : '1.5px solid #FCD34D',
            cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(217, 119, 6, 0.12)',
            transition: 'all 0.15s ease'
          }}
          title="Bấm để xem danh sách các đơn chưa thanh toán"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#B45309', fontWeight: 900, letterSpacing: '0.5px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#D97706' }} />
            <span>3. CHƯA THU TIỀN</span>
          </div>
          <div style={{ fontSize: '24px', fontWeight: 900, color: '#B45309', marginTop: '2px' }}>
            {formatVnd(unpaidTotalVndAll)}
          </div>
          <div style={{ fontSize: '12px', color: '#92400E', fontWeight: 800 }}>
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
            border: viewMode === 'completed' ? '2px solid #16A34A' : '1.5px solid #BBF7D0',
            cursor: 'pointer',
            boxShadow: 'var(--shadow-sm)',
            transition: 'all 0.15s ease'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#15803D', fontWeight: 900, letterSpacing: '0.5px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#16A34A' }} />
            <span>4. ĐÃ THU TIỀN</span>
          </div>
          <div style={{ fontSize: '24px', fontWeight: 900, color: '#15803D', marginTop: '2px' }}>
            {formatVnd(completedTotalVndAll)}
          </div>
          <div style={{ fontSize: '12px', color: '#15803D', fontWeight: 800 }}>
            {completedOrdersAll.length} đơn đã thu tiền
          </div>
        </div>
      </div>

      {/* 2. THANH CÔNG CỤ TÌM KIẾM, BỘ LỌC & TẠO ĐƠN TẠI QUẦY */}
      <div style={{
        backgroundColor: 'var(--color-surface)',
        padding: '14px 18px',
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', flex: 1 }}>
          {/* Ô tìm kiếm tức thì */}
          <div style={{ flex: '1 1 240px', position: 'relative' }}>
            <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '13px', color: '#475569', fontWeight: 800 }}>
              Tìm:
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Nhập tên khách, SĐT, mã đơn, số sân..."
              style={{
                width: '100%',
                padding: '9px 12px 9px 48px',
                borderRadius: 'var(--radius-sm)',
                border: '1.5px solid var(--color-border)',
                fontSize: '13px',
                fontWeight: 600,
                color: '#0F172A',
                backgroundColor: 'var(--color-bg)',
                outline: 'none'
              }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                style={{
                  position: 'absolute',
                  right: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: '#475569',
                  cursor: 'pointer',
                  fontWeight: 800,
                  fontSize: '14px'
                }}
              >
                ✕
              </button>
            )}
          </div>

          {/* Lọc theo Sân */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '12px', fontWeight: 800, color: '#0F172A' }}>SÂN:</span>
            <select
              value={selectedCourtFilter}
              onChange={e => setSelectedCourtFilter(e.target.value)}
              style={{
                padding: '8px 12px',
                borderRadius: 'var(--radius-sm)',
                border: '1.5px solid var(--color-border)',
                fontSize: '13px',
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
            <span style={{ fontSize: '12px', fontWeight: 800, color: '#0F172A' }}>THANH TOÁN:</span>
            <select
              value={paymentFilter}
              onChange={e => setPaymentFilter(e.target.value as any)}
              style={{
                padding: '8px 12px',
                borderRadius: 'var(--radius-sm)',
                border: '1.5px solid var(--color-border)',
                fontSize: '13px',
                fontWeight: 800,
                backgroundColor: 'var(--color-bg)',
                color: paymentFilter === 'unpaid' ? '#B45309' : paymentFilter === 'paid' ? '#15803D' : 'var(--color-deep)'
              }}
            >
              <option value="all">Tất cả thanh toán</option>
              <option value="unpaid">Chưa thu tiền</option>
              <option value="cash">Đã thu tiền mặt</option>
              <option value="transfer">Đã thu chuyển khoản</option>
              <option value="paid">Đã thu tiền (Tất cả)</option>
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
                padding: '8px 12px',
                backgroundColor: '#F1F5F9',
                color: '#334155',
                border: '1px solid #CBD5E1',
                borderRadius: 'var(--radius-sm)',
                fontSize: '12px',
                fontWeight: 800,
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
              padding: '10px 20px',
              backgroundColor: 'var(--color-deep)',
              color: 'var(--color-accent)',
              border: '2px solid var(--color-accent)',
              borderRadius: 'var(--radius-sm)',
              fontWeight: 900,
              fontSize: '13px',
              letterSpacing: '0.4px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              boxShadow: '0 2px 6px rgba(0,0,0,0.15)'
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
                  <h3 style={{ fontSize: '17px', fontWeight: 900, color: '#0F172A', margin: 0 }}>
                    1. CHỜ NHẬN ĐƠN
                  </h3>
                  <div style={{ fontSize: '12px', color: '#334155', fontWeight: 700 }}>
                    Khách vừa đặt, chuẩn bị nước
                  </div>
                </div>
              </div>
              <span style={{
                backgroundColor: pendingOrders.length > 0 ? 'var(--color-primary)' : 'var(--color-surface)',
                color: pendingOrders.length > 0 ? '#FFFFFF' : '#334155',
                fontSize: '14px',
                fontWeight: 900,
                padding: '3px 12px',
                borderRadius: 'var(--radius-full)',
                border: '1px solid var(--color-border)'
              }}>
                {pendingOrders.length}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {pendingOrders.length === 0 ? (
                <div style={{
                  padding: '36px 10px',
                  textAlign: 'center',
                  color: '#475569',
                  fontSize: '13px',
                  fontWeight: 700,
                  backgroundColor: 'var(--color-surface)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border)'
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
                  <h3 style={{ fontSize: '17px', fontWeight: 900, color: '#0F172A', margin: 0 }}>
                    2. MANG RA SÂN
                  </h3>
                  <div style={{ fontSize: '12px', color: '#334155', fontWeight: 700 }}>
                    Đem nước ra sân & chọn hình thức thu
                  </div>
                </div>
              </div>
              <span style={{
                backgroundColor: deliveringOrders.length > 0 ? '#2563EB' : 'var(--color-surface)',
                color: deliveringOrders.length > 0 ? '#FFFFFF' : '#334155',
                fontSize: '14px',
                fontWeight: 900,
                padding: '3px 12px',
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
                  color: '#475569',
                  fontSize: '13px',
                  fontWeight: 700,
                  backgroundColor: 'var(--color-surface)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border)'
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
            border: unpaidOrders.length > 0 ? '2px solid #D97706' : '1.5px solid #FCD34D',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: '9px', height: '9px', borderRadius: '50%', backgroundColor: '#D97706' }} />
                <div>
                  <h3 style={{ fontSize: '17px', fontWeight: 900, color: '#92400E', margin: 0 }}>
                    3. CHƯA THU TIỀN
                  </h3>
                  <div style={{ fontSize: '12px', color: '#B45309', fontWeight: 800 }}>
                    Chưa thu: {formatVnd(unpaidOrders.reduce((s, o) => s + o.totalVnd, 0))}
                  </div>
                </div>
              </div>
              <span style={{
                backgroundColor: unpaidOrders.length > 0 ? '#D97706' : '#FEF3C7',
                color: unpaidOrders.length > 0 ? '#FFFFFF' : '#B45309',
                fontSize: '14px',
                fontWeight: 900,
                padding: '3px 12px',
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
                  fontSize: '13px',
                  backgroundColor: '#FEF3C7',
                  borderRadius: 'var(--radius-md)',
                  fontWeight: 700,
                  border: '1px solid #FCD34D'
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
                  <h3 style={{ fontSize: '17px', fontWeight: 900, color: '#0F172A', margin: 0 }}>
                    4. ĐÃ THU TIỀN
                  </h3>
                  <div style={{ fontSize: '12px', color: '#334155', fontWeight: 700 }}>
                    Đã giao & thu tiền
                  </div>
                </div>
              </div>
              <span style={{
                backgroundColor: 'var(--color-surface)',
                color: '#334155',
                fontSize: '14px',
                fontWeight: 900,
                padding: '3px 12px',
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
                  color: '#475569',
                  fontSize: '13px',
                  fontWeight: 700,
                  backgroundColor: 'var(--color-surface)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border)'
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
