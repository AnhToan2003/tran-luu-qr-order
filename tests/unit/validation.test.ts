import { describe, expect, it } from 'vitest';
import { dateTimeString, items, placeOrderSchema } from '../../server/validation.js';

describe('Input integrity validation', () => {
  it('rejects invalid transfer dates instead of persisting Invalid Date', () => {
    expect(() => dateTimeString.parse('not-a-date')).toThrow();
  });

  it('rejects ice quantity greater than the ordered quantity', () => {
    expect(() => items.parse([{ productId: 'water', quantity: 1, iceQuantity: 2 }])).toThrow();
  });

  it('accepts a valid order line with bounded ice quantity', () => {
    const parsed = placeOrderSchema.parse({
      clientRequestId: 'request-1',
      items: [{ productId: 'water', quantity: 2, iceQuantity: 2 }]
    });
    expect(parsed.items[0].iceQuantity).toBe(2);
  });
});
