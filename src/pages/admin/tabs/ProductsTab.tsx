import React from 'react';
import { Product, formatVnd } from '../../../types/product';

interface ProductsTabProps {
  products: Product[];
  onOpenAddModal: () => void;
  onOpenEditModal: (product: Product) => void;
  onOpenStockModal: (product: Product) => void;
  onDeleteProduct: (id: string) => void;
}

export const ProductsTab: React.FC<ProductsTabProps> = ({
  products,
  onOpenAddModal,
  onOpenEditModal,
  onOpenStockModal,
  onDeleteProduct,
}) => {
  const [filterMode, setFilterMode] = React.useState<'all' | 'low_stock'>('all');

  const lowStockThreshold = (p: Product) => p.minStockThreshold ?? 5;
  const lowStockProducts = React.useMemo(() => {
    return products.filter(p => p.isAvailable && p.stock <= lowStockThreshold(p));
  }, [products]);

  const outOfStockProducts = React.useMemo(() => {
    return products.filter(p => p.isAvailable && p.stock === 0);
  }, [products]);

  const displayedProducts = React.useMemo(() => {
    if (filterMode === 'low_stock') {
      return lowStockProducts;
    }
    return products;
  }, [products, filterMode, lowStockProducts]);

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div>
          <h2 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 800, color: 'var(--color-deep)' }}>
            Quản Lý Danh Mục Nước & Tồn Kho
          </h2>
        </div>
        <button
          onClick={onOpenAddModal}
          style={{
            padding: '10px 18px',
            backgroundColor: 'var(--color-primary)',
            color: '#FFFFFF',
            borderRadius: 'var(--radius-md)',
            fontWeight: 700,
            fontSize: 'var(--font-size-sm)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          <span>➕ Thêm sản phẩm mới</span>
        </button>
      </div>

      {/* CẢNH BÁO TỒN KHO (LOW STOCK ALERT BANNERS) */}
      {outOfStockProducts.length > 0 && (
        <div style={{
          backgroundColor: '#FEE2E2',
          border: '1px solid #F87171',
          borderRadius: 'var(--radius-md)',
          padding: '12px 16px',
          marginBottom: '12px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          color: '#991B1B',
          fontSize: 'var(--font-size-sm)'
        }}>
          <span style={{ fontSize: '20px' }}>❌</span>
          <div>
            <strong style={{ fontWeight: 800 }}>ĐÃ HẾT HÀNG ({outOfStockProducts.length} sản phẩm): </strong>
            <span>{outOfStockProducts.map(p => p.name).join(', ')}. Khách sẽ không thể đặt các món này!</span>
          </div>
        </div>
      )}

      {lowStockProducts.length > outOfStockProducts.length && (
        <div style={{
          backgroundColor: '#FEF3C7',
          border: '1px solid #FBBF24',
          borderRadius: 'var(--radius-md)',
          padding: '12px 16px',
          marginBottom: '16px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          color: '#92400E',
          fontSize: 'var(--font-size-sm)'
        }}>
          <span style={{ fontSize: '20px' }}>⚠️</span>
          <div>
            <strong style={{ fontWeight: 800 }}>CẢNH BÁO SẮP HẾT ({lowStockProducts.length - outOfStockProducts.length} sản phẩm còn &le; 5 chai): </strong>
            <span>{lowStockProducts.filter(p => p.stock > 0).map(p => `${p.name} (${p.stock} chai)`).join(', ')}. Vui lòng chuẩn bị lấy thêm từ kho tổng vào quầy!</span>
          </div>
        </div>
      )}

      {/* FILTER BUTTONS */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <button
          onClick={() => setFilterMode('all')}
          style={{
            padding: '6px 14px',
            borderRadius: 'var(--radius-sm)',
            fontWeight: 700,
            fontSize: 'var(--font-size-xs)',
            backgroundColor: filterMode === 'all' ? 'var(--color-primary)' : 'var(--color-surface)',
            color: filterMode === 'all' ? '#FFFFFF' : 'var(--color-text-main)',
            border: '1px solid var(--color-border)'
          }}
        >
          Tất cả ({products.length})
        </button>
        <button
          onClick={() => setFilterMode('low_stock')}
          style={{
            padding: '6px 14px',
            borderRadius: 'var(--radius-sm)',
            fontWeight: 700,
            fontSize: 'var(--font-size-xs)',
            backgroundColor: filterMode === 'low_stock' ? '#DC2626' : (lowStockProducts.length > 0 ? '#FEF2F2' : 'var(--color-surface)'),
            color: filterMode === 'low_stock' ? '#FFFFFF' : (lowStockProducts.length > 0 ? '#DC2626' : 'var(--color-text-muted)'),
            border: filterMode === 'low_stock' ? '1px solid #DC2626' : (lowStockProducts.length > 0 ? '1px solid #FCA5A5' : '1px solid var(--color-border)')
          }}
        >
          ⚠️ Sắp hết / Hết hàng ({lowStockProducts.length})
        </button>
      </div>

      {/* Product Table */}
      <div style={{
        backgroundColor: 'var(--color-surface)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--color-border)',
        overflow: 'hidden',
        boxShadow: 'var(--shadow-sm)'
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--font-size-sm)' }}>
          <thead>
            <tr style={{ backgroundColor: 'var(--color-bg)', borderBottom: '1px solid var(--color-border)' }}>
              <th style={{ padding: '12px 16px', fontWeight: 700 }}>Ảnh</th>
              <th style={{ padding: '12px 16px', fontWeight: 700 }}>Tên sản phẩm</th>
              <th style={{ padding: '12px 16px', fontWeight: 700 }}>Dung tích</th>
              <th style={{ padding: '12px 16px', fontWeight: 700 }}>Giá vốn (nhập)</th>
              <th style={{ padding: '12px 16px', fontWeight: 700 }}>Giá bán</th>
              <th style={{ padding: '12px 16px', fontWeight: 700 }}>Tiền lời / Chai</th>
              <th style={{ padding: '12px 16px', fontWeight: 700 }}>Tồn kho</th>
              <th style={{ padding: '12px 16px', fontWeight: 700 }}>Trạng thái</th>
              <th style={{ padding: '12px 16px', fontWeight: 700, textAlign: 'right' }}>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {displayedProducts.map(p => {
              const cost = p.costPriceVnd || 0;
              const profit = p.priceVnd - cost;
              const margin = p.priceVnd > 0 ? Math.round((profit / p.priceVnd) * 100) : 0;
              const isOutOfStock = p.stock <= 0;
              const isLowStock = !isOutOfStock && p.stock <= lowStockThreshold(p);

              return (
                <tr key={p.id} style={{ borderBottom: '1px solid var(--color-border)', backgroundColor: isOutOfStock ? '#FFF5F5' : undefined }}>
                  <td style={{ padding: '10px 16px', width: '60px' }}>
                    <div style={{
                      width: '44px',
                      height: '44px',
                      backgroundColor: 'var(--color-bg)',
                      borderRadius: 'var(--radius-sm)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '4px'
                    }}>
                      {p.imageSvg && <img src={p.imageSvg} alt={p.name} style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }} />}
                    </div>
                  </td>
                  <td style={{ padding: '10px 16px', fontWeight: 700, color: 'var(--color-text-main)' }}>
                    {p.name}
                    {p.tag && (
                      <span style={{
                        marginLeft: '8px',
                        backgroundColor: 'var(--color-accent)',
                        color: 'var(--color-accent-text)',
                        fontSize: '10px',
                        fontWeight: 800,
                        padding: '1px 6px',
                        borderRadius: '4px'
                      }}>
                        {p.tag}
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '10px 16px', color: 'var(--color-text-muted)' }}>{p.volume}</td>
                  <td style={{ padding: '10px 16px', color: 'var(--color-text-muted)', fontSize: 'var(--font-size-xs)' }}>
                    {formatVnd(cost)}
                  </td>
                  <td style={{ padding: '10px 16px', fontWeight: 800, color: 'var(--color-deep)' }}>
                    {formatVnd(p.priceVnd)}
                  </td>
                  <td style={{ padding: '10px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontWeight: 800, color: profit >= 0 ? '#16a34a' : '#dc2626' }}>
                        +{formatVnd(profit)}
                      </span>
                      <span style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        backgroundColor: profit >= 0 ? '#dcfce7' : '#fee2e2',
                        color: profit >= 0 ? '#15803d' : '#b91c1c',
                        padding: '1px 6px',
                        borderRadius: '4px'
                      }}>
                        {margin}%
                      </span>
                    </div>
                  </td>
                  <td style={{ padding: '10px 16px' }}>
                    {isOutOfStock ? (
                      <span style={{
                        fontWeight: 800,
                        color: '#991B1B',
                        backgroundColor: '#FEE2E2',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: 'var(--font-size-xs)'
                      }}>
                        ❌ Hết hàng (0 chai)
                      </span>
                    ) : isLowStock ? (
                      <span style={{
                        fontWeight: 800,
                        color: '#B45309',
                        backgroundColor: '#FEF3C7',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: 'var(--font-size-xs)'
                      }}>
                        ⚠️ Sắp hết ({p.stock} chai)
                      </span>
                    ) : (
                      <span style={{
                        fontWeight: 800,
                        color: 'var(--color-primary)',
                        backgroundColor: 'var(--color-primary-light)',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: 'var(--font-size-xs)'
                      }}>
                        🟢 {p.stock} chai
                      </span>
                    )}
                  </td>
                <td style={{ padding: '10px 16px' }}>
                  <span style={{ fontSize: 'var(--font-size-xs)', color: p.isAvailable ? 'var(--color-primary)' : 'var(--color-text-muted)' }}>
                    {p.isAvailable ? '🟢 Đang bán' : '⚪ Đã ẩn'}
                  </span>
                </td>
                <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                  <div style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}>
                    <button
                      onClick={() => onOpenStockModal(p)}
                      style={{
                        padding: '6px 10px',
                        backgroundColor: 'var(--color-primary-light)',
                        color: 'var(--color-primary)',
                        borderRadius: 'var(--radius-sm)',
                        fontWeight: 700,
                        fontSize: 'var(--font-size-xs)'
                      }}
                      title="Lịch sử & Điều chỉnh tồn kho"
                    >
                      📦 Kho
                    </button>
                    <button
                      onClick={() => onOpenEditModal(p)}
                      style={{
                        padding: '6px 12px',
                        backgroundColor: 'var(--color-bg)',
                        border: '1px solid var(--color-border)',
                        borderRadius: 'var(--radius-sm)',
                        fontWeight: 700,
                        fontSize: 'var(--font-size-xs)'
                      }}
                    >
                      ✏️ Sửa
                    </button>
                    <button
                      onClick={() => onDeleteProduct(p.id)}
                      style={{
                        padding: '6px 8px',
                        backgroundColor: '#FEE2E2',
                        color: '#DC2626',
                        borderRadius: 'var(--radius-sm)',
                        fontWeight: 700,
                        fontSize: 'var(--font-size-xs)'
                      }}
                    >
                      🗑️
                    </button>
                  </div>
                </td>
              </tr>
            ); })}
          </tbody>
        </table>
      </div>
    </div>
  );
};