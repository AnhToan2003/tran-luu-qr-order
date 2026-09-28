import { useState, useMemo, useCallback } from 'react';
import type { OrderItem } from '../types/order.js';
import type { Product } from '../types/product.js';

export function useCart(initialItems: OrderItem[] = []) {
  const [cartItems, setCartItems] = useState<OrderItem[]>(initialItems);

  const totalCartVnd = useMemo(() => {
    return cartItems.reduce((sum, item) => sum + item.lineTotal, 0);
  }, [cartItems]);

  const totalCartBottles = useMemo(() => {
    return cartItems.reduce((sum, item) => sum + item.quantity, 0);
  }, [cartItems]);

  const addToCart = useCallback((product: Product) => {
    if (!product.isAvailable || product.stock <= 0) return;

    setCartItems(prev => {
      const existing = prev.find(item => item.productId === product.id);
      if (existing) {
        if (existing.quantity >= product.stock) return prev;
        const newQty = existing.quantity + 1;
        return prev.map(item =>
          item.productId === product.id
            ? {
                ...item,
                quantity: newQty,
                lineTotal: newQty * item.unitPrice
              }
            : item
        );
      }

      const newItem: OrderItem = {
        productId: product.id,
        name: product.name,
        volume: product.volume,
        category: product.category,
        unitPrice: product.priceVnd,
        costPrice: product.costPriceVnd,
        quantity: 1,
        iceQuantity: 0,
        lineTotal: product.priceVnd,
        imageSvg: product.imageSvg
      };
      return [...prev, newItem];
    });
  }, []);

  const updateQuantity = useCallback((productId: string, delta: number, maxStock?: number) => {
    setCartItems(prev => {
      return prev.flatMap(item => {
        if (item.productId !== productId) return [item];
        const nextQty = item.quantity + delta;
        if (nextQty <= 0) return [];
        const clampedQty = maxStock ? Math.min(nextQty, maxStock) : nextQty;
        return [{
          ...item,
          quantity: clampedQty,
          iceQuantity: Math.min(item.iceQuantity, clampedQty),
          lineTotal: clampedQty * item.unitPrice
        }];
      });
    });
  }, []);

  const updateIceQuantity = useCallback((productId: string, iceQty: number) => {
    setCartItems(prev => {
      return prev.map(item => {
        if (item.productId !== productId) return item;
        const clampedIce = Math.max(0, Math.min(iceQty, item.quantity));
        return { ...item, iceQuantity: clampedIce };
      });
    });
  }, []);

  const removeItem = useCallback((productId: string) => {
    setCartItems(prev => prev.filter(item => item.productId !== productId));
  }, []);

  const clearCart = useCallback(() => {
    setCartItems([]);
  }, []);

  const reconcileWithProducts = useCallback((products: Product[]) => {
    let hasChanged = false;
    setCartItems(prev => {
      if (!prev.length) return prev;
      const reconciled = prev.flatMap(item => {
        const match = products.find(p => p.id === item.productId);
        if (!match || match.isAvailable === false || match.stock <= 0) {
          hasChanged = true;
          return [];
        }
        const clampedQty = Math.min(item.quantity, match.stock);
        if (clampedQty !== item.quantity || match.priceVnd !== item.unitPrice) {
          hasChanged = true;
          return [{
            ...item,
            quantity: clampedQty,
            iceQuantity: Math.min(item.iceQuantity, clampedQty),
            unitPrice: match.priceVnd,
            lineTotal: clampedQty * match.priceVnd
          }];
        }
        return [item];
      });
      return reconciled;
    });
    return hasChanged;
  }, []);

  return {
    cartItems,
    setCartItems,
    totalCartVnd,
    totalCartBottles,
    addToCart,
    updateQuantity,
    updateIceQuantity,
    removeItem,
    clearCart,
    reconcileWithProducts
  };
}
