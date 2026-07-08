// 금액 계산 단일 소스 — SKILL.md §4
// 서버에서만 계산. 프론트는 /orders/quote 응답만 표시.
import { gradeRule } from '../../common/grade';
import { floor } from '../../common/util';

export interface QuoteItemInput {
  skuId: number;
  productId: number;
  categoryId: number;
  salePrice: number; // sku.salePrice 기준이 아니라 product.salePrice
  extraPrice: number;
  quantity: number;
}

export interface CouponInput {
  discountType: 'FIXED' | 'RATE';
  discountValue: number;
  maxDiscount: number | null;
  minOrderAmount: number;
  scope: 'ALL' | 'CATEGORY' | 'PRODUCT';
  scopeCategoryIds: number[]; // 서브트리 포함 해석 ID 목록
  scopeProductId: number | null; // 상품 전용 쿠폰
}

export interface QuoteResult {
  itemsTotal: number;
  gradeDiscount: number;
  couponDiscount: number;
  pointsUsed: number;
  shippingFee: number;
  payAmount: number;
  discountedTotal: number;
  grade: string;
}

export class PriceCalculator {
  /** §4-1 고정 계산 순서 */
  static calc(
    items: QuoteItemInput[],
    grade: string,
    pointBalance: number,
    requestedPoints: number,
    coupon: CouponInput | null,
  ): QuoteResult {
    if (items.length === 0) {
      throw new Error('주문 상품이 없습니다.');
    }

    // 1. itemsTotal
    const itemsTotal = items.reduce(
      (s, it) => s + (it.salePrice + it.extraPrice) * it.quantity,
      0,
    );

    // 2. gradeDiscount
    const gRate = gradeRule(grade as any).gradeRate;
    const gradeDiscount = floor(itemsTotal * gRate);

    // 3. couponDiscount
    let couponDiscount = 0;
    if (coupon) {
      // 스코프별 할인 기준액(등급할인 비율 적용 후) 산출
      let scopeBase: number; // 쿠폰이 적용되는 기준액
      let checkBase: number; // 최소주문금액 검증 기준액
      if (coupon.scope === 'CATEGORY' && coupon.scopeCategoryIds.length) {
        const catBase = items
          .filter((it) => coupon.scopeCategoryIds.includes(it.categoryId))
          .reduce((s, it) => s + (it.salePrice + it.extraPrice) * it.quantity, 0);
        checkBase = catBase;
        scopeBase = catBase - floor(catBase * gRate);
      } else if (coupon.scope === 'PRODUCT' && coupon.scopeProductId) {
        const prodBase = items
          .filter((it) => it.productId === coupon.scopeProductId)
          .reduce((s, it) => s + (it.salePrice + it.extraPrice) * it.quantity, 0);
        checkBase = prodBase;
        scopeBase = prodBase - floor(prodBase * gRate);
      } else {
        checkBase = itemsTotal - gradeDiscount;
        scopeBase = itemsTotal - gradeDiscount;
      }
      if (checkBase < coupon.minOrderAmount) {
        throw new Error('쿠폰 최소주문금액 미달입니다.');
      }
      if (coupon.discountType === 'FIXED') {
        couponDiscount = Math.min(coupon.discountValue, scopeBase);
      } else {
        const d = floor((scopeBase * coupon.discountValue) / 100);
        couponDiscount = coupon.maxDiscount != null ? Math.min(d, coupon.maxDiscount) : d;
      }
      couponDiscount = Math.max(0, Math.min(couponDiscount, scopeBase));
    }

    // 4. discountedTotal
    const discountedTotal = itemsTotal - gradeDiscount - couponDiscount;

    // 5. pointsUsed (100P 단위, 잔액/결제액 제한)
    const maxByBalance = Math.min(pointBalance, discountedTotal);
    const usablePoint =
      Math.floor(Math.min(requestedPoints || 0, maxByBalance) / 100) * 100;
    const pointsUsed = Math.max(0, usablePoint);

    // 6. shippingFee
    const afterPoint = discountedTotal - pointsUsed;
    const shippingFee = afterPoint >= 50000 ? 0 : 3000;

    // 7. payAmount
    const payAmount = discountedTotal - pointsUsed + shippingFee;

    return {
      itemsTotal,
      gradeDiscount,
      couponDiscount,
      pointsUsed,
      shippingFee,
      payAmount,
      discountedTotal,
      grade,
    };
  }

  /** §4-3 부분 반품 환불 안분 */
  static itemRefund(
    payAmount: number,
    pointsUsed: number,
    itemsTotal: number,
    itemUnitPrice: number,
    itemQty: number,
    isLast: boolean,
  ): { refundAmount: number; refundPoints: number } {
    const ratio = (itemUnitPrice * itemQty) / itemsTotal;
    let refundAmount = floor(payAmount * ratio);
    let refundPoints = floor(pointsUsed * ratio);
    if (isLast) {
      // 잔여 전액 보정: 타 항목들이 floor 비율로 환불되었다고 가정하고 잔여를 전부 흡수
      const otherRatio = (itemsTotal - itemUnitPrice * itemQty) / itemsTotal;
      refundAmount = payAmount - floor(payAmount * otherRatio);
      refundPoints = pointsUsed - floor(pointsUsed * otherRatio);
    }
    return { refundAmount, refundPoints };
  }
}
