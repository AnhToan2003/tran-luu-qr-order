import React from 'react';
import { Product, formatVnd } from '../data/mockProducts';

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
  return (
    <div style={{
      backgroundColor: 'var(--color-surface)',
      borderRadius: 'var(--radius-lg)',
      border: '1px solid var(--color-border)',
      padding: '12px',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      position: 'relative',
      boxShadow: 'var(--shadow-sm)',
      transition: 'var(--transition-fast)'
    }}>
      {/* Product Tag / Category */}
      {product.tag && (
        <span style={{
          position: 'absolute',
          top: '10px',
          left: '10px',
          zIndex: 2,
          backgroundColor: 'var(--color-accent)',
          color: 'var(--color-accent-text)',
          fontSize: '11px',
          fontWeight: 700,
          padding: '2px 8px',
          borderRadius: 'var(--radius-full)',
          boxShadow: '0 1px 3px rgba(0,0,0,0.06)'
        }}>
          {product.tag}
        </span>
      )}

      {/* Bottle Artwork (4:3 aspect ratio, contain fit) */}
      <div style={{
        width: '100%',
        aspectRatio: '4 / 3',
        backgroundColor: 'var(--color-bg)',
        borderRadius: 'var(--radius-md)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '8px',
        marginBottom: '10px',
        overflow: 'hidden'
      }}>
        <img
          src={product.imageSvg}
          alt={product.name}
          style={{
            maxHeight: '100%',
            maxWidth: '100%',
            objectFit: 'contain',
            filter: 'drop-shadow(0 4px 6px rgba(18, 67, 46, 0.08))'
          }}
          loading="lazy"
        />
      </div>

      {/* Details: Name & Volume */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <h3 style={{
          fontSize: 'var(--font-size-base)',
          fontWeight: 700,
          color: 'var(--color-text-main)',
          lineHeight: 1.25,
          marginBottom: '2px'
        }}>
          {product.name}
        </h3>
        <span style={{
          fontSize: 'var(--font-size-xs)',
          color: 'var(--color-text-muted)',
          marginBottom: '8px'
        }}>
          Dung tích: {product.volume}
        </span>
      </div>

      {/* Price & Action Row */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: '6px',
        paddingTop: '8px',
        borderTop: '1px dashed var(--color-border-subtle)',
        minHeight: '44px' // Ensure fixed height so button state switch doesn't jump layout
      }}>
        <div>
          <div style={{
            fontSize: 'var(--font-size-base)',
            fontWeight: 800,
            color: 'var(--color-deep)'
          }}>
            {formatVnd(product.priceVnd)}
          </div>
        </div>

        {/* Counter or Add Button */}
        {quantityInCart === 0 ? (
          <button
            onClick={onAddToCart}
            style={{
              minHeight: '38px',
              padding: '0 16px',
              backgroundColor: 'var(--color-primary)',
              color: 'var(--color-text-inverse)',
              borderRadius: 'var(--radius-md)',
              fontSize: 'var(--font-size-sm)',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              transition: 'var(--transition-fast)'
            }}
            aria-label={`Thêm ${product.name} vào giỏ hàng`}
          >
            <span style={{ fontSize: '16px', lineHeight: 1 }}>+</span>
            <span>Thêm</span>
          </button>
        ) : (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            backgroundColor: 'var(--color-primary-light)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--color-primary)',
            overflow: 'hidden'
          }}>
            <button
              onClick={onDecrease}
              style={{
                width: '36px',
                height: '36px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--color-primary)',
                fontWeight: 800,
                fontSize: '18px'
              }}
              aria-label={`Giảm số lượng ${product.name}`}
            >
              −
            </button>
            <span style={{
              minWidth: '24px',
              textAlign: 'center',
              fontWeight: 700,
              fontSize: 'var(--font-size-sm)',
              color: 'var(--color-deep)'
            }}>
              {quantityInCart}
            </span>
            <button
              onClick={onIncrease}
              style={{
                width: '36px',
                height: '36px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--color-primary)',
                fontWeight: 800,
                fontSize: '18px'
              }}
              aria-label={`Tăng số lượng ${product.name}`}
            >
              +
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
