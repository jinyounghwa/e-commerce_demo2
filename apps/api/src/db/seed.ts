// 시드 — SKILL.md §11. 멱등: DB 삭제 후 재생성.
import 'reflect-metadata';
import bcrypt from 'bcryptjs';
import { getDb, getRaw, resetDb, schema } from './client';
import { migrate } from './migrate';
import { eq } from 'drizzle-orm';
import { GRADE_RULES } from '../common/grade';
import { addDays, makeOrderNo, nowISO, pick, randInt, randomTrackingNo } from '../common/util';
import { SHIPMENT_LOCATIONS } from '../common/state-machine';

const PLAIN = 'demo1234';
const PICSUM = (id: number) => `https://picsum.photos/seed/mall${id}/400/400`;

const COLORS = ['블랙', '화이트', '네이비', '그레이'];
const SIZES = ['S', 'M', 'L', 'XL'];
const LEAF_CATS = [3, 4, 6, 7, 10, 11, 12]; // depth 1~3 상품 부착용

const PRODUCT_NAMES = [
  '오버핏 코튼 티셔츠', '슬림핏 데님 팬츠', '플로럴 롱 원피스', '미니 크로스백',
  '무선 블루투스 이어폰', '고속 충전기 C타입', '스테인리스 텀블러', '베이직 맨투맨',
  '와이드 카고 팬츠', '니트 가디건', '캔버스 토트백', '게이밍 헤드셋',
  '무선 마우스', '우드 커팅보드', '오가닉 티셔츠', '치노 팬츠', '릴력스 슬랙스',
  '플리츠 스커트', '버클 백팩', '스마트 워치', '보조배터리', '세라믹 머그컵',
  '기모 후드티', '트레이닝 팬츠', '래시 가드', '에코백', '블루투스 스피커',
  'LED 데스크램프', '글래스 보틀', '베이직 피케', '조거 팬츠', '투피스 세트',
  '숄더백', '무선 키보드', '차량용 충전기', '다구 세트', '로고 티셔츠', '슬림 진',
  '롱 카디건', '미니 파우치', '노이즈캔슬 이어폰', '멀티탭', '테이블워머',
  '오버사이즈 셔츠', '반바지', '트렌치 코트', '지갑', '스마트폰 거치대', '커피잔 세트',
  '기본 맨투맨', '린넨 셔츠',
];

function desc() {
  return '프리미엄 소재로 제작된 데모 상품입니다. 실제 구매/배송/CS 플로우 시연용으로 제공됩니다.';
}

async function main() {
  resetDb();
  migrate();
  const db = getDb();
  const raw = getRaw();
  const tx = raw.transaction(() => seed(db));
  tx();
  console.log('✓ 시드 완료');
}

function seed(db: ReturnType<typeof getDb>) {
  const hash = bcrypt.hashSync(PLAIN, 10);

  // ── 관리자 ──
  db.insert(schema.users).values({
    email: 'admin@demo.com', passwordHash: hash, name: '관리자', role: 'ADMIN',
    grade: 'VIP', totalSpent: 0, pointBalance: 0,
  }).run();

  // ── 회원 10명 + 등급 분포 ──
  // VIP 1, GOLD 1, SILVER 3, BRONZE 5
  const gradeSpec: { grade: string; spent: number; pts: number }[] = [
    { grade: 'VIP', spent: 3200000, pts: 60000 },
    { grade: 'GOLD', spent: 1200000, pts: 36000 },
    { grade: 'SILVER', spent: 350000, pts: 12000 },
    { grade: 'SILVER', spent: 320000, pts: 10000 },
    { grade: 'SILVER', spent: 300000, pts: 9000 },
    ...Array(5).fill({ grade: 'BRONZE', spent: 50000, pts: 1000 }),
  ];
  const userIds: number[] = [];
  gradeSpec.forEach((g, i) => {
    const r = db.insert(schema.users).values({
      email: `user${i + 1}@demo.com`, passwordHash: hash, name: `사용자${i + 1}`,
      role: 'USER', grade: g.grade, totalSpent: g.spent, pointBalance: g.pts,
    }).returning({ id: schema.users.id }).get();
    userIds.push(r.id);
    // 주소 (기본배송지 1)
    db.insert(schema.addresses).values({
      userId: r.id, label: '집', receiver: `사용자${i + 1}`, phone: '010-1234-5678',
      zipcode: '06236', addr1: '서울시 강남구 테헤란로 123', addr2: '101동 201호', isDefault: 1,
    }).run();
    // 포인트 원장 (잔액과 일치)
    db.insert(schema.pointLedger).values({
      userId: r.id, amount: g.pts, type: 'ADMIN', memo: '시드 지급', expiresAt: addDays(nowISO(), 90),
    }).run();
  });

  // ── 카테고리 (12, 3-depth) ──
  const catDefs: { name: string; parent: number | null; depth: number }[] = [
    { name: '패션', parent: null, depth: 1 },
    { name: '남성', parent: 1, depth: 2 },
    { name: '티셔츠', parent: 2, depth: 3 },
    { name: '바지', parent: 2, depth: 3 },
    { name: '여성', parent: 1, depth: 2 },
    { name: '원피스', parent: 5, depth: 3 },
    { name: '가방', parent: 5, depth: 3 },
    { name: '전자기기', parent: null, depth: 1 },
    { name: '모바일', parent: 8, depth: 2 },
    { name: '이어폰', parent: 9, depth: 3 },
    { name: '충전기', parent: 9, depth: 3 },
    { name: '생활용품', parent: null, depth: 1 },
  ];
  catDefs.forEach((c, i) => {
    db.insert(schema.categories).values({
      name: c.name, parentId: c.parent, depth: c.depth, sortOrder: i + 1,
    }).run();
  });

  // ── 상품 50개 ──
  type ProdRow = { id: number; hasOpt: boolean; catId: number };
  const prods: ProdRow[] = [];
  for (let i = 0; i < 50; i++) {
    const hasOpt = i < 20; // 20개 옵션 있음
    const catId = LEAF_CATS[i % LEAF_CATS.length];
    const base = 19000 + randInt(30) * 1000; // 19,000~49,000
    const sale = Math.round((base - randInt(8) * 1000) / 1000) * 1000;
    const detailImages = JSON.stringify([
      `https://picsum.photos/seed/mall-d${i + 1}-1/800/1000`,
      `https://picsum.photos/seed/mall-d${i + 1}-2/800/1000`,
      `https://picsum.photos/seed/mall-d${i + 1}-3/800/1000`,
    ]);
    const p = db.insert(schema.products).values({
      categoryId: catId, name: PRODUCT_NAMES[i] || `상품${i + 1}`,
      description: desc(), basePrice: base, salePrice: sale, thumbnailUrl: PICSUM(i + 1),
      detailImages, status: 'ON_SALE',
    }).returning({ id: schema.products.id }).get();

    if (hasOpt) {
      const opt = db.insert(schema.productOptions).values({
        productId: p.id, name: '옵션', sortOrder: 1,
      }).returning({ id: schema.productOptions.id }).get();
      // 색상×사이즈 단일 옵션그룹으로 결합 → 값 "블랙/S" 형태
      const combos: { valueIds: number[]; label: string; extra: number }[] = [];
      COLORS.forEach((c, ci) => {
        SIZES.forEach((s, si) => {
          const v = db.insert(schema.productOptionValues).values({
            optionId: opt.id, value: `${c}/${s}`, sortOrder: ci * 4 + si,
          }).returning({ id: schema.productOptionValues.id }).get();
          combos.push({ valueIds: [v.id], label: `${c} / ${s}`, extra: (ci + si) * 500 });
        });
      });
      combos.forEach((cb) => {
        const stock = 10 + randInt(40);
        db.insert(schema.skus).values({
          productId: p.id, optionValueIds: JSON.stringify(cb.valueIds),
          optionLabel: cb.label, extraPrice: cb.extra, stock, isActive: 1,
        }).run();
      });
    } else {
      const stock = 10 + randInt(40);
      db.insert(schema.skus).values({
        productId: p.id, optionValueIds: '[]', optionLabel: '기본',
        extraPrice: 0, stock, isActive: 1,
      }).run();
    }
    prods.push({ id: p.id, hasOpt, catId });
  }

  // ── 쿠폰 5종 ──
  const couponDefs = [
    { name: '가입축하 3,000원', discountType: 'FIXED', discountValue: 3000, maxDiscount: null, minOrderAmount: 0, issueType: 'AUTO_SIGNUP', validDays: 30, totalQuantity: null, scope: 'ALL', scopeCategoryId: null },
    { name: '10% 할인 (최대 5,000)', discountType: 'RATE', discountValue: 10, maxDiscount: 5000, minOrderAmount: 0, issueType: 'DOWNLOAD', validDays: 14, totalQuantity: null, scope: 'ALL', scopeCategoryId: null },
    { name: '5만원 이상 5,000원', discountType: 'FIXED', discountValue: 5000, maxDiscount: null, minOrderAmount: 50000, issueType: 'DOWNLOAD', validDays: 14, totalQuantity: null, scope: 'ALL', scopeCategoryId: null },
    { name: '패션카테고리 15% (최대 1만)', discountType: 'RATE', discountValue: 15, maxDiscount: 10000, minOrderAmount: 0, issueType: 'DOWNLOAD', validDays: 14, totalQuantity: null, scope: 'CATEGORY', scopeCategoryId: 1 },
    { name: '수량한정 20매 2,000원', discountType: 'FIXED', discountValue: 2000, maxDiscount: null, minOrderAmount: 10000, issueType: 'DOWNLOAD', validDays: 30, totalQuantity: 20, scope: 'ALL', scopeCategoryId: null },
  ];
  couponDefs.forEach((c) => {
    const coupon = db.insert(schema.coupons).values({
      name: c.name, discountType: c.discountType, discountValue: c.discountValue,
      maxDiscount: c.maxDiscount, minOrderAmount: c.minOrderAmount, issueType: c.issueType,
      validDays: c.validDays, totalQuantity: c.totalQuantity, issuedCount: 0,
      scope: c.scope, scopeCategoryId: c.scopeCategoryId, scopeProductId: (c as any).scopeProductId ?? null, isActive: 1,
    }).returning({ id: schema.coupons.id }).get();
    // 가입쿠폰: 모든 유저에게 발급
    if (c.issueType === 'AUTO_SIGNUP') {
      userIds.forEach((uid) => {
        db.insert(schema.userCoupons).values({
          userId: uid, couponId: coupon.id, status: 'UNUSED',
          issuedAt: nowISO(), expiresAt: addDays(nowISO(), c.validDays),
        }).run();
      });
      db.update(schema.coupons).set({ issuedCount: userIds.length })
        .where(eq(schema.coupons.id, coupon.id)).run();
    }
  });

  // ── 상품 전용 쿠폰 (상품 1·2·3 각각 전용) ──
  const prodCouponDefs = [
    { pid: prods[0].id, name: '이 상품 전용 5,000원', discountType: 'FIXED', discountValue: 5000, minOrderAmount: 0, validDays: 14 },
    { pid: prods[1].id, name: '이 상품 전용 10% 할인', discountType: 'RATE', discountValue: 10, maxDiscount: 3000, minOrderAmount: 0, validDays: 14 },
    { pid: prods[2].id, name: '이 상품 전용 3,000원', discountType: 'FIXED', discountValue: 3000, minOrderAmount: 20000, validDays: 30 },
  ];
  prodCouponDefs.forEach((c) => {
    db.insert(schema.coupons).values({
      name: c.name, discountType: c.discountType, discountValue: c.discountValue,
      maxDiscount: (c as any).maxDiscount ?? null, minOrderAmount: c.minOrderAmount,
      issueType: 'DOWNLOAD', validDays: c.validDays, totalQuantity: null, issuedCount: 0,
      scope: 'PRODUCT', scopeCategoryId: null, scopeProductId: c.pid, isActive: 1,
    }).run();
  });

  // ── 주문 30건 ──
  const orderStatusPlan: string[] = [
    ...Array(10).fill('DELIVERED'),
    ...Array(5).fill('DELIVERING'),
    ...Array(5).fill('PREPARING'),
    ...Array(4).fill('PAID'),
    ...Array(4).fill('CONFIRMED'),
    ...Array(2).fill('CANCELED'),
  ];

  const shipmentStatusFor = (os: string): string => {
    switch (os) {
      case 'PREPARING': return 'READY';
      case 'DELIVERING': return 'OUT_FOR_DELIVERY';
      case 'DELIVERED':
      case 'CONFIRMED': return 'DELIVERED';
      default: return 'READY';
    }
  };

  // 재고 차감용 helper
  const decStock = (skuId: number, qty: number) => {
    const cur = db.select().from(schema.skus).where(eq(schema.skus.id, skuId)).get();
    if (cur) {
      const ns = Math.max(0, cur.stock - qty);
      db.update(schema.skus).set({ stock: ns }).where(eq(schema.skus.id, skuId)).run();
    }
  };

  orderStatusPlan.forEach((status, idx) => {
    const uid = pick(userIds);
    const itemCount = 1 + randInt(2);
    const items: { skuId: number; productId: number; name: string; label: string; unit: number; qty: number }[] = [];
    for (let k = 0; k < itemCount; k++) {
      const pr = pick(prods);
      const sku = db.select().from(schema.skus).where(eq(schema.skus.productId, pr.id)).all();
      const s = pick(sku);
      const prod = db.select().from(schema.products).where(eq(schema.products.id, pr.id)).get()!;
      const unit = prod.salePrice + s.extraPrice;
      const qty = 1 + randInt(2);
      items.push({ skuId: s.id, productId: pr.id, name: prod.name, label: s.optionLabel, unit, qty });
      if (status !== 'CANCELED') decStock(s.id, qty);
    }
    const itemsTotal = items.reduce((s, it) => s + it.unit * it.qty, 0);
    const shippingFee = itemsTotal >= 50000 ? 0 : 3000;
    const payAmount = itemsTotal + shippingFee;
    const created = addDays(nowISO(), -randInt(20));
    const order = db.insert(schema.orders).values({
      orderNo: makeOrderNo(idx + 1, new Date(created)),
      userId: uid, status,
      itemsTotal, couponDiscount: 0, gradeDiscount: 0, pointsUsed: 0, shippingFee, payAmount,
      receiver: `사용자${userIds.indexOf(uid) + 1}`, phone: '010-1234-5678',
      zipcode: '06236', addr1: '서울시 강남구 테헤란로 123', addr2: '101동 201호',
      createdAt: created, paidAt: status === 'CANCELED' ? null : created,
    }).returning({ id: schema.orders.id }).get();

    items.forEach((it) => {
      db.insert(schema.orderItems).values({
        orderId: order.id, skuId: it.skuId, productId: it.productId,
        productName: it.name, optionLabel: it.label, unitPrice: it.unit, quantity: it.qty,
        status: 'NORMAL',
      }).run();
    });

    // 결제 (취소 제외)
    if (status !== 'CANCELED') {
      db.insert(schema.payments).values({
        orderId: order.id, method: 'MOCK_CARD', status: 'SUCCESS', createdAt: created,
      }).run();
    } else {
      db.insert(schema.payments).values({
        orderId: order.id, method: 'MOCK_CARD', status: 'SUCCESS', createdAt: created,
      }).run();
    }

    // 배송 (PAID/CANCELED 제외)
    if (status !== 'PAID' && status !== 'CANCELED') {
      const ss = shipmentStatusFor(status);
      const events: any[] = [];
      const seq: string[] = ['READY', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED'];
      const upto = seq.indexOf(ss);
      for (let i = 0; i <= upto; i++) {
        events.push({ status: seq[i], location: SHIPMENT_LOCATIONS[seq[i]], at: addDays(created, i) });
      }
      db.insert(schema.shipments).values({
        orderId: order.id, trackingNo: randomTrackingNo(), status: ss, events: JSON.stringify(events),
      }).run();
    }

    // CONFIRMED → 포인트 적립 (원장만, 잔액은 이미 세팅됨)
    if (status === 'CONFIRMED') {
      const u = db.select().from(schema.users).where(eq(schema.users.id, uid)).get()!;
      const rule = GRADE_RULES.find((r) => r.grade === u.grade)!;
      const earn = Math.floor(payAmount * rule.pointRate);
      if (earn > 0) {
        db.insert(schema.pointLedger).values({
          userId: uid, amount: earn, type: 'EARN_ORDER', refOrderId: order.id,
          memo: '구매확정 적립', expiresAt: addDays(nowISO(), 90),
        }).run();
        db.update(schema.users).set({ pointBalance: u.pointBalance + earn, totalSpent: u.totalSpent + payAmount })
          .where(eq(schema.users.id, uid)).run();
      }
    }
  });

  // ── 클레임: 반품 2(1 INSPECTING), 교환 1 ──
  const deliveredOrders = db.select().from(schema.orders).where(eq(schema.orders.status, 'DELIVERED')).all();
  const confirmedOrders = db.select().from(schema.orders).where(eq(schema.orders.status, 'CONFIRMED')).all();
  const claimTargets = [...deliveredOrders.slice(0, 2), ...confirmedOrders.slice(0, 1)];
  if (claimTargets[0]) {
    const oi = db.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, claimTargets[0].id)).all()[0];
    db.insert(schema.claims).values({
      orderId: claimTargets[0].id, orderItemId: oi.id, userId: claimTargets[0].userId,
      type: 'RETURN', status: 'INSPECTING', reason: '상품 불량', detail: '봉제 불량',
    }).run();
  }
  if (claimTargets[1]) {
    const oi = db.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, claimTargets[1].id)).all()[0];
    db.insert(schema.claims).values({
      orderId: claimTargets[1].id, orderItemId: oi.id, userId: claimTargets[1].userId,
      type: 'RETURN', status: 'REFUNDED', reason: '단순 변심', inspectionResult: 'RESTOCK',
      refundAmount: oi.unitPrice * oi.quantity, refundPoints: 0, resolvedAt: nowISO(),
    }).run();
    db.update(schema.skus).set({ stock: (db.select().from(schema.skus).where(eq(schema.skus.id, oi.skuId)).get())!.stock + oi.quantity })
      .where(eq(schema.skus.id, oi.skuId)).run();
  }
  if (claimTargets[2]) {
    const oi = db.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, claimTargets[2].id)).all()[0];
    db.insert(schema.claims).values({
      orderId: claimTargets[2].id, orderItemId: oi.id, userId: claimTargets[2].userId,
      type: 'EXCHANGE', status: 'COMPLETED', reason: '사이즈 교환', inspectionResult: 'RESTOCK',
      refundAmount: 0, refundPoints: 0, resolvedAt: nowISO(),
    }).run();
  }

  // ── 리뷰 25건 ──
  const reviewable = [...deliveredOrders, ...confirmedOrders];
  let revCount = 0;
  for (const o of reviewable) {
    if (revCount >= 25) break;
    const ois = db.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, o.id)).all();
    for (const oi of ois) {
      if (revCount >= 25) break;
      const exists = db.select().from(schema.reviews).where(eq(schema.reviews.orderItemId, oi.id)).get();
      if (exists) continue;
      db.insert(schema.reviews).values({
        userId: o.userId, orderItemId: oi.id, productId: oi.productId,
        rating: 3 + randInt(2), content: pick(['좋습니다!', '배송 빠르고 품질 만족', '재구매 의사 있어요', '가성비 최고', '색상이 사진과 같아요']),
        isVisible: 1,
      }).run();
      revCount++;
    }
  }

  // ── Q&A 10건 (3 미답변) ──
  const qnaContents = ['재입고 예정 있나요?', '사이즈 표 좀 알려주세요', '세탁기 사용 가능한가요?', '배송 며칠 걸리나요?', '할인 중인데 품절인가요?', '옵션 추가 가능한가요?', '색상 다른 것도 있나요?', 'A/S 가능한가요?', '반품 비용 어떻게 되나요?', 'B2B 구매 가능?'];
  qnaContents.forEach((q, i) => {
    const pr = pick(prods);
    db.insert(schema.qnas).values({
      userId: pick(userIds), productId: pr.id, question: q,
      answer: i >= 7 ? null : '안내해 드리겠습니다. 자세한 내용은 고객센터로 문의 부탁드립니다.',
      answeredAt: i >= 7 ? null : nowISO(),
      isSecret: 0,
    }).run();
  });

  // ── 알림 샘플 ──
  userIds.forEach((uid, i) => {
    db.insert(schema.notifications).values({
      userId: uid, type: 'ORDER', title: '주문 안내', body: `주문이 접수되었습니다.`, link: '/my/orders',
    }).run();
    if (i === 0) {
      db.insert(schema.notifications).values({
        userId: uid, type: 'COUPON', title: '쿠폰 만료 임박', body: '가입축하 쿠폰이 곧 만료됩니다.', link: '/my/coupons',
      }).run();
    }
  });

  // ── 재고 보정: 모든 상품이 주문 가능하도록 보장 (모든 SKU가 0인 상품은 첫 SKU 재고 충전) ──
  const raw = getRaw();
  const dead = raw.prepare(`SELECT s.product_id AS pid FROM skus s GROUP BY s.product_id HAVING COALESCE(SUM(s.stock), 0) = 0`).all() as { pid: number }[];
  let restocked = 0;
  for (const d of dead) {
    const first = raw.prepare(`SELECT id FROM skus WHERE product_id = ? ORDER BY id LIMIT 1`).get(d.pid) as { id: number } | undefined;
    if (first) {
      raw.prepare(`UPDATE skus SET stock = 20 WHERE id = ?`).run(first.id);
      restocked++;
    }
  }
  // 대시보드 재고부족 데모용: 일부 SKU를 저재고(3~4)로 설정 (모든 상품은 주문 가능 상태 유지)
  const lowTarget = raw.prepare(`SELECT id FROM skus ORDER BY RANDOM() LIMIT 6`).all() as { id: number }[];
  for (const t of lowTarget) {
    raw.prepare(`UPDATE skus SET stock = ? WHERE id = ?`).run(3 + randInt(2), t.id);
  }

  console.log(`  - 관리자 1, 회원 ${userIds.length}`);
  console.log(`  - 카테고리 ${catDefs.length}, 상품 ${prods.length}`);
  console.log(`  - 쿠폰 ${couponDefs.length}, 주문 ${orderStatusPlan.length}`);
  console.log(`  - 리뷰 ${revCount}, Q&A ${qnaContents.length}`);
  console.log(`  - 재고 보정: 품절 상품 ${restocked}건 충전 (모든 상품 주문 가능 보장)`);
}

// 클라우드 배포용: DB가 비어 있으면 자동 시드 (휘발성 파일시스템 대응)
export async function seedIfEmpty() {
  const db = getDb();
  const hasData = db.select().from(schema.users).all().length > 0;
  if (hasData) return false;
  const raw = getRaw();
  raw.transaction(() => seed(db))();
  console.log('✓ 자동 시드 완료 (빈 DB 감지)');
  return true;
}

// 직접 실행 시에만 resetDb + migrate + seed (import 시에는 동작 안 함)
if (require.main === module) {
  main().catch((e) => {
    console.error('시드 실패:', e);
    process.exit(1);
  });
}
