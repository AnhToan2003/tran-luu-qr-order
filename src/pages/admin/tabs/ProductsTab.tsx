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
              <th style={{ padding: '12px 16px', fontWeight: 700 }}>Giá bán</th>
              <th style={{ padding: '12px 16px', fontWeight: 700 }}>Tồn kho</th>
              <th style={{ padding: '12px 16px', fontWeight: 700 }}>Trạng thái</th>
              <th style={{ padding: '12px 16px', fontWeight: 700, textAlign: 'right' }}>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {products.map(p => (
              <tr key={p.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
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
                <td style={{ padding: '10px 16px', fontWeight: 800, color: 'var(--color-deep)' }}>{formatVnd(p.priceVnd)}</td>
                <td style={{ padding: '10px 16px' }}>
                  <span style={{
                    fontWeight: 800,
                    color: p.stock > 0 ? 'var(--color-primary)' : 'var(--color-status-urgent)',
                    backgroundColor: p.stock > 0 ? 'var(--color-primary-light)' : '#FEE2E2',
                    padding: '2px 8px',
                    borderRadius: '4px'
                  }}>
                    {p.stock} chai
                  </span>
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
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};