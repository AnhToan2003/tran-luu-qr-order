import React, { useState, useEffect, useCallback } from 'react';
import { formatVnd } from '../../../types/product';
import { Court } from '../../../types/order';
import { SportsItem, PosCartItem, SPORTS_CATEGORY_LABELS } from '../../../types/sports';
import { apiFetch, stableRequestId, completeRequest } from '../../../lib/api';

interface SportsPosTabProps {
  courts: Court[];
}

export const SportsPosTab: React.FC<SportsPosTabProps> = ({ courts }) => {
  const [items, setItems] = useState<SportsItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<'all' | 'products' | 'services'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Cart State
  const [cart, setCart] = useState<PosCartItem[]>([]);
  const [selectedCourtId, setSelectedCourtId] = useState<string>('counter');
  const [customerName, setCustomerName] = useState<string>('');
  const [customerPhone, setCustomerPhone] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'transfer'>('cash');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string>('');

  // Completed Order Receipt Modal
  const [completedOrder, setCompletedOrder] = useState<any | null>(null);

  const fetchItems = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const res = await apiFetch('/api/admin/sports/items');
      if (!res.ok) throw new Error('Không thể tải danh sách sản phẩm');
      const data = await res.json();
      setItems((data.items || []).filter((i: SportsItem) => i.isAvailable));
    } catch (err: any) {
      setError(err.message || 'Lỗi tải dữ liệu');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const addToCart = (item: SportsItem) => {
    if (!item.isService && item.stock <= 0) {
      alert(`Sản phẩm "${item.name}" đã hết hàng trong kho!`);
      return;
    }

    setCart(prev => {
      const existing = prev.find(ci => ci.item.itemId === item.itemId);
      if (existing) {
        if (!item.isService && existing.quantity >= item.stock) {
          alert(`Chỉ còn ${item.stock} ${item.unit} trong kho!`);
          return prev;
        }
        return prev.map(ci =>
          ci.item.itemId === item.itemId
            ? { ...ci, quantity: ci.quantity + 1 }
            : ci
        );
      }
      return [...prev, { item, quantity: 1, priceVnd: item.priceVnd }];
    });
  };

  const updateQuantity = (itemId: string, delta: number) => {
    setCart(prev => {
      return prev
        .map(ci => {
          if (ci.item.itemId === itemId) {
            const next = ci.quantity + delta;
            if (!ci.item.isService && next > ci.item.stock) {
              alert(`Tồn kho chỉ còn ${ci.item.stock} ${ci.item.unit}`);
              return ci;
            }
            return { ...ci, quantity: next };
          }
          return ci;
        })
        .filter(ci => ci.quantity > 0);
    });
  };

  const removeFromCart = (itemId: string) => {
    setCart(prev => prev.filter(ci => ci.item.itemId !== itemId));
  };

  const clearCart = () => {
    setCart([]);
    setCustomerName('');
    setCustomerPhone('');
    setSubmitError('');
  };

  const cartTotalVnd = cart.reduce((sum, ci) => sum + ci.priceVnd * ci.quantity, 0);

  const handleCheckout = async () => {
    if (cart.length === 0 || isSubmitting) return;

    setIsSubmitting(true);
    setSubmitError('');

    try {
      const targetCourt = courts.find(c => c.id === selectedCourtId || c.code === selectedCourtId);
      const courtName = selectedCourtId === 'counter'
        ? 'Quầy Lễ Tân (Khách vãng lai)'
        : (targetCourt?.name || `Sân ${selectedCourtId}`);

      const orderData = {
        courtId: selectedCourtId,
        courtNameSnapshot: courtName,
        customerName: customerName.trim() || 'Khách tại quầy',
        customerPhone: customerPhone.trim(),
        paymentMethod,
        items: cart.map(ci => ({
          itemId: ci.item.itemId,
          quantity: ci.quantity,
          priceVnd: ci.priceVnd
        }))
      };

      const clientRequestId = stableRequestId('sports-pos-order', orderData);
      const payload = {
        ...orderData,
        clientRequestId
      };

      const res = await apiFetch('/api/admin/sports/pos/order', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || 'Lỗi khi tạo đơn bán hàng');
      }

      completeRequest('sports-pos-order');
      const data = await res.json();
      setCompletedOrder(data.order);
      clearCart();
      fetchItems(); // Tải lại để cập nhật tồn kho mới
    } catch (err: any) {
      setSubmitError(err.message || 'Lỗi khi thanh toán đơn hàng');
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredItems = items.filter(i => {
    const matchType = selectedTypeFilter === 'all'
      ? true
      : selectedTypeFilter === 'services' ? i.isService : !i.isService;
    const matchCat = selectedCategory === 'all' || i.category === selectedCategory;
    const matchSearch = !searchQuery.trim() || i.name.toLowerCase().includes(searchQuery.trim().toLowerCase());
    return matchType && matchCat && matchSearch;
  });

  return (
    <div style={{ padding: '20px 24px', maxWidth: '1600px', margin: '0 auto' }}>
      
      {/* HEADER SECTION */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: '22px', fontWeight: 900, color: '#0F172A', margin: 0, letterSpacing: '-0.02em' }}>
            Quầy Điều Hành Bán Thể Thao & Dịch Vụ Sân
          </h2>
          <p style={{ fontSize: '13px', color: '#334155', marginTop: '4px', fontWeight: 600 }}>
            Tạo đơn bán nhanh vợt, vớ, cầu lông và các dịch vụ đan cước, thuê đồ trực tiếp tại quầy
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={fetchItems}
            disabled={isLoading}
            style={{
              padding: '8px 14px',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: 'var(--color-surface)',
              border: '1.5px solid var(--color-border)',
              fontSize: '12px',
              fontWeight: 800,
              cursor: 'pointer'
            }}
          >
            Tải lại menu
          </button>
        </div>
      </div>

      {error && (
        <div style={{ backgroundColor: '#FEF2F2', border: '1px solid #F87171', color: '#991B1B', padding: '10px 14px', borderRadius: 'var(--radius-sm)', marginBottom: '14px', fontSize: '13px', fontWeight: 700 }}>
          {error}
        </div>
      )}

      {/* POS LAYOUT: TỰ ĐỘNG MỞ RỘNG 100% KHI CHƯA CHỌN MÓN */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: cart.length > 0 ? '1fr 380px' : '1fr',
        gap: '20px',
        alignItems: 'start'
      }}>
        
        {/* LEFT COLUMN: ITEM PICKER */}
        <div>
          {/* Toolbar Bộ Lọc & Tìm Kiếm Gọn Gàng */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            backgroundColor: 'var(--color-surface)',
            padding: '12px 16px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--color-border)',
            marginBottom: '16px',
            flexWrap: 'wrap'
          }}>
            {/* Search Input */}
            <div style={{ flex: '1 1 240px', minWidth: '200px' }}>
              <input
                type="text"
                placeholder="Tìm nhanh tên vợt, vớ, cầu lông, dịch vụ..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1.5px solid var(--color-border)',
                  fontSize: '13px',
                  fontWeight: 600,
                  outline: 'none',
                  backgroundColor: '#F8FAFC'
                }}
              />
            </div>

            {/* Type Segmented Control */}
            <div style={{ display: 'flex', gap: '4px', backgroundColor: '#F1F5F9', padding: '3px', borderRadius: 'var(--radius-sm)' }}>
              <button
                type="button"
                onClick={() => setSelectedTypeFilter('all')}
                style={{
                  padding: '6px 12px',
                  borderRadius: '4px',
                  border: 'none',
                  fontSize: '12px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  backgroundColor: selectedTypeFilter === 'all' ? '#0A6B4A' : 'transparent',
                  color: selectedTypeFilter === 'all' ? '#FFFFFF' : '#475569',
                  transition: 'all 0.15s ease'
                }}
              >
                TẤT CẢ
              </button>
              <button
                type="button"
                onClick={() => setSelectedTypeFilter('products')}
                style={{
                  padding: '6px 12px',
                  borderRadius: '4px',
                  border: 'none',
                  fontSize: '12px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  backgroundColor: selectedTypeFilter === 'products' ? '#0A6B4A' : 'transparent',
                  color: selectedTypeFilter === 'products' ? '#FFFFFF' : '#475569',
                  transition: 'all 0.15s ease'
                }}
              >
                HÀNG THỂ THAO
              </button>
              <button
                type="button"
                onClick={() => setSelectedTypeFilter('services')}
                style={{
                  padding: '6px 12px',
                  borderRadius: '4px',
                  border: 'none',
                  fontSize: '12px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  backgroundColor: selectedTypeFilter === 'services' ? '#0A6B4A' : 'transparent',
                  color: selectedTypeFilter === 'services' ? '#FFFFFF' : '#475569',
                  transition: 'all 0.15s ease'
                }}
              >
                DỊCH VỤ SÂN
              </button>
            </div>

            {/* Category Select Dropdown */}
            <div style={{ flex: '0 0 auto', minWidth: '180px' }}>
              <select
                value={selectedCategory}
                onChange={e => setSelectedCategory(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1.5px solid var(--color-border)',
                  fontSize: '13px',
                  fontWeight: 800,
                  backgroundColor: 'var(--color-surface)',
                  color: '#0F172A',
                  cursor: 'pointer'
                }}
              >
                <option value="all">Tất cả danh mục phụ...</option>
                {Object.entries(SPORTS_CATEGORY_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* ITEM GRID */}
          {isLoading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#64748B', fontWeight: 700, backgroundColor: 'var(--color-surface)', borderRadius: 'var(--radius-md)' }}>
              Đang tải danh mục hàng thể thao...
            </div>
          ) : filteredItems.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#64748B', fontWeight: 700, backgroundColor: 'var(--color-surface)', borderRadius: 'var(--radius-md)' }}>
              Không tìm thấy sản phẩm hoặc dịch vụ nào phù hợp.
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
              gap: '14px'
            }}>
              {filteredItems.map(item => {
                const isOutOfStock = !item.isService && item.stock <= 0;
                return (
                  <div
                    key={item.itemId}
                    onClick={() => !isOutOfStock && addToCart(item)}
                    style={{
                      backgroundColor: 'var(--color-surface)',
                      borderRadius: 'var(--radius-md)',
                      border: '1.5px solid var(--color-border)',
                      padding: '16px',
                      cursor: isOutOfStock ? 'not-allowed' : 'pointer',
                      opacity: isOutOfStock ? 0.6 : 1,
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      transition: 'all 0.15s ease',
                      boxShadow: 'var(--shadow-sm)'
                    }}
                  >
                    <div>
                      {/* Product Image Banner */}
                      {item.imageSvg && (
                        <div style={{
                          width: '100%',
                          height: '110px',
                          borderRadius: '6px',
                          overflow: 'hidden',
                          backgroundColor: '#FFFFFF',
                          marginBottom: '10px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          border: '1px solid #E2E8F0'
                        }}>
                          <img
                            src={item.imageSvg}
                            alt={item.name}
                            style={{
                              width: '100%',
                              height: '100%',
                              objectFit: 'contain',
                              mixBlendMode: 'multiply',
                              padding: '2px'
                            }}
                            onError={(e) => { (e.currentTarget.parentElement as HTMLElement).style.display = 'none'; }}
                          />
                        </div>
                      )}

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                        <span style={{
                          fontSize: '11px',
                          fontWeight: 800,
                          color: item.isService ? '#1D4ED8' : '#334155',
                          backgroundColor: item.isService ? '#EFF6FF' : '#F1F5F9',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          textTransform: 'uppercase'
                        }}>
                          {SPORTS_CATEGORY_LABELS[item.category] || item.category}
                        </span>
                        {item.tag && (
                          <span style={{ fontSize: '10px', fontWeight: 800, color: '#B45309', backgroundColor: '#FEF3C7', padding: '2px 5px', borderRadius: '4px' }}>
                            {item.tag}
                          </span>
                        )}
                      </div>

                      <div style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A', marginTop: '8px', lineHeight: '1.4' }}>
                        {item.name}
                      </div>
                    </div>

                    <div style={{ marginTop: '14px', paddingTop: '10px', borderTop: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                      <div>
                        <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 700 }}>
                          {item.isService ? 'Dịch vụ sân' : `Tồn kho: ${item.stock} ${item.unit}`}
                        </div>
                        <div style={{ fontSize: '16px', fontWeight: 900, color: '#0A6B4A', marginTop: '2px' }}>
                          {formatVnd(item.priceVnd)}
                        </div>
                      </div>

                      <button
                        type="button"
                        disabled={isOutOfStock}
                        style={{
                          padding: '6px 12px',
                          borderRadius: 'var(--radius-sm)',
                          border: 'none',
                          backgroundColor: isOutOfStock ? '#E2E8F0' : '#0A6B4A',
                          color: isOutOfStock ? '#94A3B8' : '#FFFFFF',
                          fontSize: '12px',
                          fontWeight: 800,
                          cursor: isOutOfStock ? 'not-allowed' : 'pointer'
                        }}
                      >
                        {isOutOfStock ? 'HẾT HÀNG' : '+ THÊM'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: POS CART & CHECKOUT (CHỈ HIỆN KHI CÓ MÓN TRONG GIỎ) */}
        {cart.length > 0 && (
          <div style={{
            backgroundColor: 'var(--color-surface)',
            borderRadius: 'var(--radius-md)',
            border: '1.5px solid var(--color-border)',
            padding: '18px',
            boxShadow: 'var(--shadow-sm)',
            position: 'sticky',
            top: '20px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '12px', borderBottom: '1px solid var(--color-border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 900, color: '#0F172A' }}>
                  GIỎ HÀNG TẠI QUẦY
                </h3>
                <span style={{ fontSize: '11px', fontWeight: 900, backgroundColor: '#ECFDF5', color: '#065F46', padding: '2px 8px', borderRadius: '10px' }}>
                  {cart.reduce((s, i) => s + i.quantity, 0)} món
                </span>
              </div>
              <button
                onClick={clearCart}
                style={{ background: 'none', border: 'none', color: '#DC2626', fontSize: '12px', fontWeight: 800, cursor: 'pointer' }}
              >
                ĐÓNG & XÓA GIỎ
              </button>
            </div>

          {/* Cart Items List */}
          <div style={{ maxHeight: '300px', overflowY: 'auto', margin: '14px 0', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {cart.length === 0 ? (
              <div style={{ padding: '30px 10px', textAlign: 'center', color: '#94A3B8', fontSize: '13px', fontWeight: 700 }}>
                Chưa có mặt hàng nào trong giỏ.<br />Bấm vào sản phẩm bên trái để chọn.
              </div>
            ) : (
              cart.map(ci => (
                <div key={ci.item.itemId} style={{ padding: '10px', backgroundColor: '#F8FAFC', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                    {ci.item.imageSvg && (
                      <div style={{ width: '36px', height: '36px', borderRadius: '4px', overflow: 'hidden', backgroundColor: '#FFFFFF', border: '1px solid var(--color-border)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <img src={ci.item.imageSvg} alt={ci.item.name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                      </div>
                    )}
                    <div style={{ fontWeight: 800, fontSize: '13px', color: '#0F172A', flex: 1 }}>
                      {ci.item.name}
                    </div>
                    <button
                      onClick={() => removeFromCart(ci.item.itemId)}
                      style={{ background: 'none', border: 'none', color: '#94A3B8', fontSize: '13px', fontWeight: 800, cursor: 'pointer', marginLeft: '6px' }}
                    >
                      ✕
                    </button>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 900, color: '#0A6B4A' }}>
                      {formatVnd(ci.priceVnd * ci.quantity)}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <button
                        onClick={() => updateQuantity(ci.item.itemId, -1)}
                        style={{ width: '26px', height: '26px', borderRadius: '4px', border: '1px solid var(--color-border)', backgroundColor: '#FFFFFF', fontWeight: 800, cursor: 'pointer' }}
                      >
                        -
                      </button>
                      <span style={{ fontSize: '13px', fontWeight: 800, minWidth: '24px', textAlign: 'center' }}>
                        {ci.quantity}
                      </span>
                      <button
                        onClick={() => updateQuantity(ci.item.itemId, 1)}
                        style={{ width: '26px', height: '26px', borderRadius: '4px', border: '1px solid var(--color-border)', backgroundColor: '#FFFFFF', fontWeight: 800, cursor: 'pointer' }}
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Customer / Court Selector */}
          <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: '#334155', marginBottom: '3px', textTransform: 'uppercase' }}>
                Đối tượng phục vụ:
              </label>
              <select
                value={selectedCourtId}
                onChange={e => setSelectedCourtId(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 'var(--radius-sm)', border: '1.5px solid var(--color-border)', fontSize: '13px', fontWeight: 700 }}
              >
                <option value="counter">Khách vãng lai tại quầy</option>
                {courts.map(c => (
                  <option key={c.id || c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: '#334155', marginBottom: '3px', textTransform: 'uppercase' }}>
                  Tên khách:
                </label>
                <input
                  type="text"
                  placeholder="Nhập tên khách..."
                  value={customerName}
                  onChange={e => setCustomerName(e.target.value)}
                  style={{ width: '100%', padding: '7px 10px', borderRadius: 'var(--radius-sm)', border: '1.5px solid var(--color-border)', fontSize: '12px' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: '#334155', marginBottom: '3px', textTransform: 'uppercase' }}>
                  Số điện thoại:
                </label>
                <input
                  type="text"
                  placeholder="09..."
                  value={customerPhone}
                  onChange={e => setCustomerPhone(e.target.value)}
                  style={{ width: '100%', padding: '7px 10px', borderRadius: 'var(--radius-sm)', border: '1.5px solid var(--color-border)', fontSize: '12px' }}
                />
              </div>
            </div>

            {/* Payment Method */}
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: '#334155', marginBottom: '3px', textTransform: 'uppercase' }}>
                Hình thức thanh toán:
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                <button
                  type="button"
                  onClick={() => setPaymentMethod('cash')}
                  style={{
                    padding: '8px',
                    borderRadius: 'var(--radius-sm)',
                    border: paymentMethod === 'cash' ? '2px solid #0A6B4A' : '1px solid var(--color-border)',
                    backgroundColor: paymentMethod === 'cash' ? '#ECFDF5' : '#FFFFFF',
                    color: paymentMethod === 'cash' ? '#065F46' : '#334155',
                    fontSize: '12px',
                    fontWeight: 800,
                    cursor: 'pointer'
                  }}
                >
                  TIỀN MẶT
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod('transfer')}
                  style={{
                    padding: '8px',
                    borderRadius: 'var(--radius-sm)',
                    border: paymentMethod === 'transfer' ? '2px solid #0A6B4A' : '1px solid var(--color-border)',
                    backgroundColor: paymentMethod === 'transfer' ? '#ECFDF5' : '#FFFFFF',
                    color: paymentMethod === 'transfer' ? '#065F46' : '#334155',
                    fontSize: '12px',
                    fontWeight: 800,
                    cursor: 'pointer'
                  }}
                >
                  CHUYỂN KHOẢN QR
                </button>
              </div>
            </div>
          </div>

          {/* Grand Total */}
          <div style={{ borderTop: '2px dashed var(--color-border)', margin: '14px 0 10px', paddingTop: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '14px', fontWeight: 900, color: '#0F172A' }}>TỔNG THANH TOÁN:</span>
            <span style={{ fontSize: '20px', fontWeight: 900, color: '#0A6B4A' }}>
              {formatVnd(cartTotalVnd)}
            </span>
          </div>

          {submitError && (
            <div style={{ padding: '8px 12px', backgroundColor: '#FEF2F2', border: '1px solid #F87171', borderRadius: '4px', color: '#DC2626', fontSize: '12px', fontWeight: 700, marginBottom: '10px' }}>
              {submitError}
            </div>
          )}

          {/* Submit Button */}
          <button
            onClick={handleCheckout}
            disabled={cart.length === 0 || isSubmitting}
            style={{
              width: '100%',
              padding: '12px',
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              backgroundColor: cart.length === 0 || isSubmitting ? '#94A3B8' : '#0A6B4A',
              color: '#FFFFFF',
              fontSize: '14px',
              fontWeight: 900,
              cursor: cart.length === 0 || isSubmitting ? 'not-allowed' : 'pointer',
              boxShadow: 'var(--shadow-sm)'
            }}
          >
            {isSubmitting ? 'ĐANG TẠO ĐƠN...' : 'HOÀN TẤT BÁN HÀNG'}
          </button>
        </div>
        )}
      </div>

      {/* COMPLETED ORDER BILL / RECEIPT MODAL */}
      {completedOrder && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '16px'
        }}>
          <div
            id="receipt-print-area"
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: 'var(--radius-lg)',
              width: '100%',
              maxWidth: '440px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.25)',
              border: '1px solid var(--color-border)',
              padding: '24px'
            }}
          >
            <div style={{ textAlign: 'center', paddingBottom: '14px', borderBottom: '1px dashed #CBD5E1' }}>
              <div style={{ fontSize: '18px', fontWeight: 900, color: '#0F172A' }}>
                SÂN CẦU LÔNG TRẦN LỰU
              </div>
              <div style={{ fontSize: '13px', color: '#475569', marginTop: '2px', fontWeight: 700 }}>
                PHIẾU BÁN HÀNG TẠI QUẦY
              </div>
              <div style={{ fontSize: '15px', fontWeight: 900, color: '#0A6B4A', marginTop: '6px' }}>
                MÃ ĐƠN: {completedOrder.displayCode}
              </div>
              <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
                {new Date(completedOrder.createdAt).toLocaleString('vi-VN')}
              </div>
            </div>

            <div style={{ margin: '14px 0', fontSize: '13px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748B', fontWeight: 600 }}>Đối tượng:</span>
                <span style={{ fontWeight: 800, color: '#0F172A' }}>{completedOrder.courtName}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748B', fontWeight: 600 }}>Khách hàng:</span>
                <span style={{ fontWeight: 800, color: '#0F172A' }}>{completedOrder.customerName}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748B', fontWeight: 600 }}>Phương thức:</span>
                <span style={{ fontWeight: 800, color: '#0F172A' }}>
                  {completedOrder.paymentMethod === 'cash' ? 'Tiền mặt' : 'Chuyển khoản QR'}
                </span>
              </div>
            </div>

            {/* Item List */}
            <div style={{ borderTop: '1px solid #E2E8F0', borderBottom: '1px solid #E2E8F0', padding: '10px 0', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {completedOrder.items?.map((it: any, idx: number) => (
                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                  <div>
                    <span style={{ fontWeight: 800, color: '#0F172A' }}>{it.nameSnapshot}</span>
                    <span style={{ color: '#64748B', marginLeft: '6px' }}>x{it.quantity}</span>
                  </div>
                  <span style={{ fontWeight: 800, color: '#0F172A' }}>
                    {formatVnd(it.lineTotalVnd)}
                  </span>
                </div>
              ))}
            </div>

            {/* Total */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '14px', marginBottom: '20px' }}>
              <span style={{ fontSize: '15px', fontWeight: 900, color: '#0F172A' }}>TỔNG CỘNG:</span>
              <span style={{ fontSize: '20px', fontWeight: 900, color: '#0A6B4A' }}>
                {formatVnd(completedOrder.totalVnd)}
              </span>
            </div>

            <div className="no-print" style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => window.print()}
                style={{
                  flex: 1,
                  padding: '10px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1.5px solid var(--color-border)',
                  backgroundColor: '#FFFFFF',
                  color: '#0F172A',
                  fontSize: '13px',
                  fontWeight: 800,
                  cursor: 'pointer'
                }}
              >
                In Phiếu
              </button>
              <button
                onClick={() => setCompletedOrder(null)}
                style={{
                  flex: 1,
                  padding: '10px',
                  borderRadius: 'var(--radius-sm)',
                  border: 'none',
                  backgroundColor: '#0A6B4A',
                  color: '#FFFFFF',
                  fontSize: '13px',
                  fontWeight: 800,
                  cursor: 'pointer'
                }}
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
