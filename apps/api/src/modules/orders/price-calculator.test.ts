import { describe, it, expect } from 'vitest';
import { PriceCalculator } from './price-calculator';

const item = (salePrice: number, extra = 0, qty = 1, categoryId = 1, skuId = 1, productId = 1) =>
  ({ skuId, productId, categoryId, salePrice, extraPrice: extra, quantity: qty });

const FIXED = (value: number, min = 0) => ({
  discountType: 'FIXED' as const, discountValue: value, maxDiscount: null, minOrderAmount: min, scope: 'ALL' as const, scopeCategoryIds: [], scopeProductId: null,
});
const RATE = (value: number, max: number | null = null, min = 0) => ({
  discountType: 'RATE' as const, discountValue: value, maxDiscount: max, minOrderAmount: min, scope: 'ALL' as const, scopeCategoryIds: [], scopeProductId: null,
});

describe('PriceCalculator', () => {
  it('1. 기본: 상품합만 (BRONZE, 쿠폰/포인트 없음)', () => {
    const r = PriceCalculator.calc([item(30000)], 'BRONZE', 0, 0, null);
    expect(r.itemsTotal).toBe(30000);
    expect(r.gradeDiscount).toBe(0);
    expect(r.couponDiscount).toBe(0);
    expect(r.pointsUsed).toBe(0);
    expect(r.shippingFee).toBe(3000); // 30000 < 50000
    expect(r.payAmount).toBe(33000);
  });

  it('2. 5만원 이상 무료배송', () => {
    const r = PriceCalculator.calc([item(50000)], 'BRONZE', 0, 0, null);
    expect(r.shippingFee).toBe(0);
    expect(r.payAmount).toBe(50000);
  });

  it('3. VIP 등급할인 3%', () => {
    const r = PriceCalculator.calc([item(100000)], 'VIP', 0, 0, null);
    expect(r.gradeDiscount).toBe(3000); // 100000 * 0.03
    expect(r.payAmount).toBe(97000 + 0); // 배송비 0 (97000>=50000)
  });

  it('4. GOLD 등급할인 2%', () => {
    const r = PriceCalculator.calc([item(100000)], 'GOLD', 0, 0, null);
    expect(r.gradeDiscount).toBe(2000);
  });

  it('5. SILVER 등급할인 1%', () => {
    const r = PriceCalculator.calc([item(100000)], 'SILVER', 0, 0, null);
    expect(r.gradeDiscount).toBe(1000);
  });

  it('6. 정액 쿠폰 (할인액 < 상품합)', () => {
    const r = PriceCalculator.calc([item(50000)], 'BRONZE', 0, 0, FIXED(3000));
    expect(r.couponDiscount).toBe(3000);
    expect(r.shippingFee).toBe(3000); // 쿠폰 적용 후 47000 < 50000 → 배송비 발생
    expect(r.payAmount).toBe(50000);
  });

  it('7. 정액 쿠폰 (할인액 > 상품합 → 상품합까지만)', () => {
    const r = PriceCalculator.calc([item(2000)], 'BRONZE', 0, 0, FIXED(5000));
    expect(r.couponDiscount).toBe(2000); // min(5000, 2000)
  });

  it('8. 정률 쿠폰 10%', () => {
    const r = PriceCalculator.calc([item(50000)], 'BRONZE', 0, 0, RATE(10));
    expect(r.couponDiscount).toBe(5000); // 50000 * 0.1
  });

  it('9. 정률 쿠폰 maxDiscount 제한', () => {
    const r = PriceCalculator.calc([item(100000)], 'BRONZE', 0, 0, RATE(10, 5000));
    expect(r.couponDiscount).toBe(5000); // 10000 계산되나 max 5000
  });

  it('10. 등급할인 + 정률쿠폰 조합 (할인기준 = 등급할인 후)', () => {
    // VIP 3% → 100000-3000=97000, 쿠폰 10% → 9700
    const r = PriceCalculator.calc([item(100000)], 'VIP', 0, 0, RATE(10));
    expect(r.gradeDiscount).toBe(3000);
    expect(r.couponDiscount).toBe(9700);
    expect(r.payAmount).toBe(100000 - 3000 - 9700); // 87300, 배송비 0
  });

  it('11. 포인트 100P 단위 절사', () => {
    const r = PriceCalculator.calc([item(50000)], 'BRONZE', 10000, 9999, null);
    expect(r.pointsUsed).toBe(9900); // floor(9999/100)*100
  });

  it('12. 포인트 잔액 초과 시 잔액까지만', () => {
    const r = PriceCalculator.calc([item(50000)], 'BRONZE', 5000, 20000, null);
    expect(r.pointsUsed).toBe(5000);
  });

  it('13. 포인트가 결제액 초과 시 결제액까지만', () => {
    const r = PriceCalculator.calc([item(5000)], 'BRONZE', 100000, 100000, null);
    expect(r.pointsUsed).toBe(5000); // min(100000, 5000) = 5000
  });

  it('14. 등급+쿠폰+포인트 전체 조합', () => {
    // VIP: 100000, 등급DC 3000 → 97000, 쿠폰 정액 5000 → 92000, 포인트 2000 → 90000, 배송비 0
    const r = PriceCalculator.calc([item(100000)], 'VIP', 10000, 2000, FIXED(5000));
    expect(r.itemsTotal).toBe(100000);
    expect(r.gradeDiscount).toBe(3000);
    expect(r.couponDiscount).toBe(5000);
    expect(r.pointsUsed).toBe(2000);
    expect(r.shippingFee).toBe(0);
    expect(r.payAmount).toBe(90000);
  });

  it('15. 옵션 추가금 포함 계산', () => {
    const r = PriceCalculator.calc([item(30000, 5000, 2)], 'BRONZE', 0, 0, null); // (30000+5000)*2=70000
    expect(r.itemsTotal).toBe(70000);
    expect(r.shippingFee).toBe(0);
  });

  it('16. 카테고리 쿠폰 (해당 카테고리만 기준)', () => {
    const catCoupon = { discountType: 'RATE' as const, discountValue: 15, maxDiscount: 10000, minOrderAmount: 0, scope: 'CATEGORY' as const, scopeCategoryIds: [1, 2, 3], scopeProductId: null };
    // 상품1(cat1) 40000, 상품2(cat5) 60000 → 카테고리 기준 40000
    const r = PriceCalculator.calc([item(40000, 0, 1, 1), item(60000, 0, 1, 5)], 'BRONZE', 0, 0, catCoupon);
    expect(r.couponDiscount).toBe(6000); // 40000 * 0.15 = 6000 (< max 10000)
  });

  it('16a. 상품 전용 쿠폰 (해당 상품만 기준)', () => {
    const prodCoupon = { discountType: 'RATE' as const, discountValue: 10, maxDiscount: null, minOrderAmount: 0, scope: 'PRODUCT' as const, scopeCategoryIds: [], scopeProductId: 1 };
    // 상품1 40000, 상품2 60000 → 상품1 기준 40000 → 10% = 4000
    const r = PriceCalculator.calc([item(40000, 0, 1, 1, 1, 1), item(60000, 0, 1, 5, 2, 2)], 'BRONZE', 0, 0, prodCoupon);
    expect(r.couponDiscount).toBe(4000);
    expect(r.payAmount).toBe(100000 - 4000); // 96000, 배송비 0
  });

  it('16b. 상품 전용 쿠폰 - 대상 상품이 장바구니에 없으면 할인 0', () => {
    const prodCoupon = { discountType: 'RATE' as const, discountValue: 10, maxDiscount: null, minOrderAmount: 0, scope: 'PRODUCT' as const, scopeCategoryIds: [], scopeProductId: 99 };
    const r = PriceCalculator.calc([item(50000, 0, 1, 1, 1, 1)], 'BRONZE', 0, 0, prodCoupon);
    expect(r.couponDiscount).toBe(0); // 대상 상품 없음 → 0
  });

  it('16c. 상품 전용 쿠폰 - 정액, 해당 상품 금액 초과 시 상품 금액까지만', () => {
    const prodCoupon = { discountType: 'FIXED' as const, discountValue: 5000, maxDiscount: null, minOrderAmount: 0, scope: 'PRODUCT' as const, scopeCategoryIds: [], scopeProductId: 1 };
    // 상품1 3000, 상품2 50000 → 상품1 기준 3000 → min(5000, 3000) = 3000
    const r = PriceCalculator.calc([item(3000, 0, 1, 1, 1, 1), item(50000, 0, 1, 5, 2, 2)], 'BRONZE', 0, 0, prodCoupon);
    expect(r.couponDiscount).toBe(3000);
  });

  it('17. 최소주문금액 미달 시 에러', () => {
    expect(() => PriceCalculator.calc([item(10000)], 'BRONZE', 0, 0, FIXED(3000, 50000))).toThrow();
  });

  it('18. 원단위 오차 0 — 정률 쿠폰 floor', () => {
    const r = PriceCalculator.calc([item(9999)], 'BRONZE', 0, 0, RATE(10));
    expect(r.couponDiscount).toBe(999); // floor(9999*0.1)=999, 정수
    expect(Number.isInteger(r.couponDiscount)).toBe(true);
    expect(Number.isInteger(r.payAmount)).toBe(true);
  });

  it('19. 배송비 임계점 정확 (49999 → 3000, 50000 → 0)', () => {
    expect(PriceCalculator.calc([item(49999)], 'BRONZE', 0, 0, null).shippingFee).toBe(3000);
    expect(PriceCalculator.calc([item(50000)], 'BRONZE', 0, 0, null).shippingFee).toBe(0);
  });

  it('20. 부분 반품 환불 안분 합계 = 원 결제액', () => {
    // itemsTotal 100000, payAmount 103000 (배송비 3000), pointsUsed 0
    const payAmount = 103000;
    const pointsUsed = 0;
    const itemsTotal = 100000;
    const items = [item(60000, 0, 1), item(40000, 0, 1)];
    let totalRefund = 0;
    let totalPoints = 0;
    items.forEach((it, i) => {
      const isLast = i === items.length - 1;
      const r = PriceCalculator.itemRefund(payAmount, pointsUsed, itemsTotal, it.salePrice, it.quantity, isLast);
      totalRefund += r.refundAmount;
      totalPoints += r.refundPoints;
    });
    expect(totalRefund).toBe(payAmount); // 전액 보정으로 합 일치
    expect(totalPoints).toBe(pointsUsed);
  });

  it('21. 부분 반품 안분 (마지막 아님) floor', () => {
    // 103000 * (60000/100000) = 61800
    const r = PriceCalculator.itemRefund(103000, 0, 100000, 60000, 1, false);
    expect(r.refundAmount).toBe(61800);
  });
});
