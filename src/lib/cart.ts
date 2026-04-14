export type CartItemPayload = {
  code: string;
  name: string;
  summary: string;
  imageUrl: string | null;
  category: string;
  rarity: string;
  price: number;
  quantity: number;
};

export type CartSessionPayload = {
  id: string;
  currency: string;
  totalAmount: number;
  totalItems: number;
  updatedAt: string;
};

export function computeCartTotals(items: CartItemPayload[]) {
  return items.reduce(
    (totals, item) => ({
      totalAmount: totals.totalAmount + item.price * item.quantity,
      totalItems: totals.totalItems + item.quantity,
    }),
    { totalAmount: 0, totalItems: 0 },
  );
}
