import React from 'react';
import { Product, formatVnd } from '../types/product';

interface ProductCardProps {
  product: Product;
  quantityInCart: number;
  onAddToCart: () => void;
  onIncrease: () => void;
  onDecrease: () => void;
}

export const ProductCard: React.FC<ProductCardProps> = ({
  product,
  quantityInCart,
  onAddToCart,
  onIncrease,
  onDecrease
}) => {
  const isOutOfStock = product.stock <= 0 || product.isAvailable === false;
  const isMaxStock = quantityInCart >= product.stock;

  return (
    <div
      style={{
        backgroundColor: '#FFFFFF',
        borderRadius: '16px',
        border: '1px solid #E2E8F0',
        padding: '11px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        position: 'relative',
        boxShadow: '0 3px 10px rgba(18, 67, 46, 0.05)',
        boxSizing: 'border-box',
        height: '100%',
        transition: 'transform 0.18s ease, box-shadow 0.18s ease'
      }}
    >
      {/* Product Tag / Category */}
      {product.tag && (
        <span
          style={{
            position: 'absolute',
            top: '9px',
            left: '9px',
            zIndex: 2,
            backgroundColor: '#ECFDF5',
            color: '#065F46',
            border: '1px solid #A7F3D0',
            fontSize: '10px',
            fontWeight: 800,
            padding: '2px 8px',
            borderRadius: '999px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            letterSpacing: '0.2px'
          }}
        >
          {product.tag}
        </span>
      )}

      {/* Product Image Frame with Pure White Seamless Background */}
      <div
        style={{
          width: '100%',
          aspectRatio: '1 / 1',
          backgroundColor: '#FFFFFF',
          borderRadius: '12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '4px',
          marginBottom: '8px',
          overflow: 'hidden',
          boxSizing: 'border-box',
          position: 'relative'
        }}
      >
        <img
          src={product.imageUrl || product.imageSvg}
          alt={product.name}
          style={{
            maxWidth: '100%',
            maxHeight: '100%',
            objectFit: 'contain',
            filter: 'drop-shadow(0 4px 10px rgba(0, 0, 0, 0.05))',
            opacity: isOutOfStock ? 0.45 : 1,
            transition: 'transform 0.2s ease'
          }}
          loading="lazy"
        />
      </div>

      {/* Details: Name & Volume */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', marginBottom: '6px' }}>
        <h3
          style={{
            fontSize: '14px',
            fontWeight: 800,
            color: isOutOfStock ? '#94A3B8' : '#0F172A',
            lineHeight: '18px',
            height: '36px',
            marginBottom: '3px',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }}
        >
          {product.name}
        </h3>
        {product.volume && (
          <span
            style={{
              fontSize: '11px',
              fontWeight: 600,
              color: '#64748B',
              lineHeight: '14px',
              height: '14px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}
          >
            {product.volume}
          </span>
        )}
      </div>

      {/* Price & Action Row */}
      <div
        style={{
          marginTop: 'auto',
          paddingTop: '8px',
          borderTop: '1px dashed #E2E8F0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '4px',
          minHeight: '34px',
          boxSizing: 'border-box'
        }}
      >
        {/* Giá tiền */}
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flexShrink: 1 }}>
          <div
            style={{
              fontSize: '15px',
              fontWeight: 900,
              color: isOutOfStock ? '#94A3B8' : '#137A49',
              letterSpacing: '-0.3px',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              lineHeight: 1.2
            }}
          >
            {formatVnd(product.priceVnd)}
          </div>
          {product.stock <= 5 && product.stock > 0 && !isOutOfStock && (
            <span style={{ fontSize: '9px', color: '#D97706', fontWeight: 700, lineHeight: 1, marginTop: '2px' }}>
              Còn {product.stock}
            </span>
          )}
        </div>

        {/* Nút hành động */}
        <div style={{ flexShrink: 0 }}>
          {isOutOfStock ? (
            product.isReserved ? (
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 800,
                  color: '#D97706',
                  backgroundColor: '#FEF3C7',
                  border: '1px solid #FDE68A',
                  padding: '3px 8px',
                  borderRadius: '6px',
                  display: 'inline-block'
                }}
                title="Sản phẩm đang được một khách hàng khác giữ tạm trong giỏ hàng"
              >
                Đang giữ
              </span>
            ) : (
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 800,
                  color: '#DC2626',
                  backgroundColor: '#FEE2E2',
                  padding: '3px 8px',
                  borderRadius: '6px',
                  display: 'inline-block'
                }}
              >
                Hết
              </span>
            )
          ) : quantityInCart === 0 ? (
            <button
              type="button"
              onClick={onAddToCart}
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                backgroundColor: '#137A49',
                backgroundImage: 'linear-gradient(135deg, #137A49 0%, #0E623A 100%)',
                color: '#FFFFFF',
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                boxShadow: '0 2px 6px rgba(19, 122, 73, 0.3)',
                transition: 'transform 0.1s ease',
                padding: 0,
                boxSizing: 'border-box'
              }}
              onMouseDown={(e) => (e.currentTarget.style.transform = 'scale(0.92)')}
              onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
              aria-label={`Thêm ${product.name} vào giỏ hàng`}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
            </button>
          ) : (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                backgroundColor: '#FFFFFF',
                border: '1.5px solid #137A49',
                borderRadius: '8px',
                height: '32px',
                overflow: 'hidden',
                boxSizing: 'border-box',
                boxShadow: '0 2px 6px rgba(19, 122, 73, 0.15)'
              }}
            >
              <button
                type="button"
                onClick={onDecrease}
                style={{
                  width: '28px',
                  height: '100%',
                  border: 'none',
                  backgroundColor: '#F0FDF4',
                  color: '#137A49',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 900,
                  fontSize: '16px',
                  cursor: 'pointer',
                  padding: 0,
                  margin: 0,
                  boxSizing: 'border-box',
                  outline: 'none'
                }}
                aria-label={`Giảm số lượng ${product.name}`}
              >
                −
              </button>
              <span
                style={{
                  minWidth: '22px',
                  textAlign: 'center',
                  fontWeight: 900,
                  fontSize: '13px',
                  color: '#0F172A',
                  userSelect: 'none',
                  padding: '0 2px',
                  lineHeight: '32px'
                }}
              >
                {quantityInCart}
              </span>
              <button
                type="button"
                onClick={onIncrease}
                disabled={isMaxStock}
                style={{
                  width: '28px',
                  height: '100%',
                  border: 'none',
                  backgroundColor: isMaxStock ? '#E2E8F0' : '#137A49',
                  color: isMaxStock ? '#94A3B8' : '#FFFFFF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 900,
                  fontSize: '16px',
                  cursor: isMaxStock ? 'not-allowed' : 'pointer',
                  padding: 0,
                  margin: 0,
                  boxSizing: 'border-box',
                  outline: 'none'
                }}
                aria-label={`Tăng số lượng ${product.name}`}
                title={isMaxStock ? `Đã đạt giới hạn tồn kho (${product.stock})` : undefined}
              >
                +
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
