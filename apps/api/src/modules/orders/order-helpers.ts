// 주문 생성 헬퍼 — 아이템 해석 + 쿠폰 스코프
import { and, eq } from 'drizzle-orm';
import { getDb, schema } from '../../db/client';
import { descendantCategoryIds } from '../../common/category-tree';
import { CouponInput, QuoteItemInput } from './price-calculator';

export interface ItemInput { skuId: number; quantity: number; }

export function resolveQuoteItems(items: ItemInput[]): QuoteItemInput[] {
  const db = getDb();
  return items.map((it) => {
    const sku = db.select().from(schema.skus).where(eq(schema.skus.id, it.skuId)).get();
    if (!sku) throw new Error('SKU 없음: ' + it.skuId);
    const product = db.select().from(schema.products).where(eq(schema.products.id, sku.productId)).get()!;
    return {
      skuId: sku.id, productId: product.id, categoryId: product.categoryId,
      salePrice: product.salePrice, extraPrice: sku.extraPrice, quantity: it.quantity,
    };
  });
}

export function resolveCouponInput(userCouponId: number | null | undefined): CouponInput | null {
  if (!userCouponId) return null;
  const db = getDb();
  const uc = db.select().from(schema.userCoupons).where(eq(schema.userCoupons.id, userCouponId)).get();
  if (!uc) throw new Error('사용자 쿠폰 없음');
  if (uc.status !== 'UNUSED') throw new Error('사용 불가능한 쿠폰');
  if (new Date(uc.expiresAt) < new Date()) throw new Error('만료된 쿠폰');
  const c = db.select().from(schema.coupons).where(eq(schema.coupons.id, uc.couponId)).get()!;
  const scopeCategoryIds = c.scope === 'CATEGORY' && c.scopeCategoryId
    ? descendantCategoryIds(c.scopeCategoryId) : [];
  return {
    discountType: c.discountType as 'FIXED' | 'RATE',
    discountValue: c.discountValue,
    maxDiscount: c.maxDiscount,
    minOrderAmount: c.minOrderAmount,
    scope: c.scope as 'ALL' | 'CATEGORY' | 'PRODUCT',
    scopeCategoryIds,
    scopeProductId: c.scopeProductId ?? null,
  };
}
