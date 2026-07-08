// 정적(데모) 모드용 브라우저 내장 DB — localStorage 에 저장
// 백엔드 없이 Netlify 등 정적 호스팅에서 전체 플로우가 동작하도록
// apps/api 의 시드(seed.ts)와 동일한 구조의 데이터를 브라우저에서 생성한다.

const STORAGE_KEY = 'malldemo-mock-db-v1';

export interface DbUser { id: number; email: string; password: string; name: string; role: 'USER' | 'ADMIN'; grade: string; totalSpent: number; pointBalance: number; }
export interface DbAddress { id: number; userId: number; label: string; receiver: string; phone: string; zipcode: string; addr1: string; addr2: string; isDefault: number; }
export interface DbCategory { id: number; name: string; parentId: number | null; depth: number; sortOrder: number; }
export interface DbOption { id: number; productId: number; name: string; values: { id: number; value: string }[]; }
export interface DbSku { id: number; productId: number; optionValueIds: string; optionLabel: string; extraPrice: number; stock: number; isActive: number; }
export interface DbProduct { id: number; categoryId: number; name: string; description: string; basePrice: number; salePrice: number; thumbnailUrl: string; detailImages: string; status: string; createdAt: string; }
export interface DbCoupon { id: number; name: string; discountType: string; discountValue: number; maxDiscount: number | null; minOrderAmount: number; issueType: string; validDays: number; totalQuantity: number | null; issuedCount: number; scope: string; scopeCategoryId: number | null; scopeProductId: number | null; isActive: number; }
export interface DbUserCoupon { id: number; userId: number; couponId: number; status: string; issuedAt: string; expiresAt: string; }
export interface DbCartItem { id: number; userId: number; skuId: number; quantity: number; }
export interface DbOrderItem { id: number; orderId: number; skuId: number; productId: number; productName: string; optionLabel: string; unitPrice: number; quantity: number; status: string; }
export interface DbOrder { id: number; orderNo: string; userId: number; status: string; itemsTotal: number; couponDiscount: number; gradeDiscount: number; pointsUsed: number; shippingFee: number; payAmount: number; receiver: string; phone: string; zipcode: string; addr1: string; addr2: string; createdAt: string; paidAt: string | null; userCouponId: number | null; }
export interface DbShipment { id: number; orderId: number; carrier: string; trackingNo: string; status: string; events: { status: string; location: string; at: string }[]; }
export interface DbClaim { id: number; orderId: number; orderItemId: number; userId: number; type: string; status: string; reason: string; detail?: string; inspectionResult?: string | null; refundAmount?: number | null; refundPoints?: number | null; createdAt: string; resolvedAt?: string | null; }
export interface DbReview { id: number; userId: number; orderItemId: number; productId: number; rating: number; content: string; adminReply?: string | null; isVisible: number; createdAt: string; }
export interface DbQna { id: number; userId: number; productId: number; question: string; answer: string | null; answeredAt: string | null; isSecret: number; createdAt: string; }
export interface DbNotification { id: number; userId: number; type: string; title: string; body: string; link: string | null; isRead: number; createdAt: string; }
export interface DbPointEntry { id: number; userId: number; amount: number; type: string; memo: string; refOrderId?: number | null; expiresAt?: string | null; createdAt: string; }
export interface DbWish { id: number; userId: number; productId: number; createdAt: string; }

export interface MockDb {
  seq: Record<string, number>;
  users: DbUser[];
  addresses: DbAddress[];
  categories: DbCategory[];
  products: DbProduct[];
  options: DbOption[];
  skus: DbSku[];
  coupons: DbCoupon[];
  userCoupons: DbUserCoupon[];
  cart: DbCartItem[];
  orders: DbOrder[];
  orderItems: DbOrderItem[];
  shipments: DbShipment[];
  claims: DbClaim[];
  reviews: DbReview[];
  qnas: DbQna[];
  notifications: DbNotification[];
  pointLedger: DbPointEntry[];
  wishlist: DbWish[];
  shipAutoRun: boolean;
  shipAutoLastTick: number;
}

export const nowISO = () => new Date().toISOString();
export const addDays = (iso: string, days: number) => { const d = new Date(iso); d.setDate(d.getDate() + days); return d.toISOString(); };
export const makeOrderNo = (seq: number, date = new Date()) => `ORD-${date.toISOString().slice(0, 10).replace(/-/g, '')}-${String(seq).padStart(4, '0')}`;
export const trackingNo = (n: number) => 'VT' + String(1000000000 + n * 7919);

export const SHIP_SEQ = ['READY', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED'];
export const SHIP_LOC: Record<string, string> = {
  READY: '판매자 물류센터', PICKED_UP: '수도권 허브', IN_TRANSIT: '간선 이동중',
  OUT_FOR_DELIVERY: '배송 캠프', DELIVERED: '고객 배송지',
};

export const GRADE_RULES = [
  { grade: 'BRONZE', minSpent: 0, gradeRate: 0.0, pointRate: 0.01 },
  { grade: 'SILVER', minSpent: 300000, gradeRate: 0.01, pointRate: 0.02 },
  { grade: 'GOLD', minSpent: 1000000, gradeRate: 0.02, pointRate: 0.03 },
  { grade: 'VIP', minSpent: 3000000, gradeRate: 0.03, pointRate: 0.05 },
];
export const gradeRule = (g: string) => GRADE_RULES.find((r) => r.grade === g) ?? GRADE_RULES[0];
export const gradeFromSpent = (spent: number) => { let g = 'BRONZE'; for (const r of GRADE_RULES) if (spent >= r.minSpent) g = r.grade; return g; };

// 결정적 난수 (시드 고정 → 새로고침해도 같은 데이터)
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PRODUCT_NAMES = [
  '오버핏 코튼 티셔츠', '슬림핏 데님 팬츠', '플로럴 롱 원피스', '미니 크로스백',
  '무선 블루투스 이어폰', '고속 충전기 C타입', '스테인리스 텀블러', '베이직 맨투맨',
  '와이드 카고 팬츠', '니트 가디건', '캔버스 토트백', '게이밍 헤드셋',
  '무선 마우스', '우드 커팅보드', '오가닉 티셔츠', '치노 팬츠', '릴랙스 슬랙스',
  '플리츠 스커트', '버클 백팩', '스마트 워치', '보조배터리', '세라믹 머그컵',
  '기모 후드티', '트레이닝 팬츠', '래시 가드', '에코백', '블루투스 스피커',
  'LED 데스크램프', '글래스 보틀', '베이직 피케', '조거 팬츠', '투피스 세트',
  '숄더백', '무선 키보드', '차량용 충전기', '다구 세트', '로고 티셔츠', '슬림 진',
  '롱 카디건', '미니 파우치', '노이즈캔슬 이어폰', '멀티탭', '테이블워머',
  '오버사이즈 셔츠', '반바지', '트렌치 코트', '지갑', '스마트폰 거치대', '커피잔 세트',
  '기본 맨투맨', '린넨 셔츠',
];
const COLORS = ['블랙', '화이트', '네이비', '그레이'];
const SIZES = ['S', 'M', 'L', 'XL'];
const LEAF_CATS = [3, 4, 6, 7, 10, 11, 12];
const PICSUM = (id: number) => `https://picsum.photos/seed/mall${id}/400/400`;

function buildSeed(): MockDb {
  const rand = mulberry32(20260708);
  const randInt = (max: number) => Math.floor(rand() * (max + 1));
  const pick = <T,>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];

  const db: MockDb = {
    seq: {}, users: [], addresses: [], categories: [], products: [], options: [], skus: [],
    coupons: [], userCoupons: [], cart: [], orders: [], orderItems: [], shipments: [],
    claims: [], reviews: [], qnas: [], notifications: [], pointLedger: [], wishlist: [],
    shipAutoRun: false, shipAutoLastTick: 0,
  };
  const next = (k: string) => (db.seq[k] = (db.seq[k] ?? 0) + 1);

  // ── 회원 ──
  db.users.push({ id: next('users'), email: 'admin@demo.com', password: 'demo1234', name: '관리자', role: 'ADMIN', grade: 'VIP', totalSpent: 0, pointBalance: 0 });
  const gradeSpec = [
    { grade: 'VIP', spent: 3200000, pts: 60000 },
    { grade: 'GOLD', spent: 1200000, pts: 36000 },
    { grade: 'SILVER', spent: 350000, pts: 12000 },
    { grade: 'SILVER', spent: 320000, pts: 10000 },
    { grade: 'BRONZE', spent: 50000, pts: 1000 },
    { grade: 'BRONZE', spent: 50000, pts: 1000 },
  ];
  const userIds: number[] = [];
  gradeSpec.forEach((g, i) => {
    const id = next('users');
    db.users.push({ id, email: `user${i + 1}@demo.com`, password: 'demo1234', name: `사용자${i + 1}`, role: 'USER', grade: g.grade, totalSpent: g.spent, pointBalance: g.pts });
    userIds.push(id);
    db.addresses.push({ id: next('addresses'), userId: id, label: '집', receiver: `사용자${i + 1}`, phone: '010-1234-5678', zipcode: '06236', addr1: '서울시 강남구 테헤란로 123', addr2: '101동 201호', isDefault: 1 });
    db.pointLedger.push({ id: next('pointLedger'), userId: id, amount: g.pts, type: 'ADMIN', memo: '시드 지급', expiresAt: addDays(nowISO(), 90), createdAt: nowISO() });
  });

  // ── 카테고리 (12, 3-depth) ──
  const catDefs: { name: string; parent: number | null; depth: number }[] = [
    { name: '패션', parent: null, depth: 1 }, { name: '남성', parent: 1, depth: 2 },
    { name: '티셔츠', parent: 2, depth: 3 }, { name: '바지', parent: 2, depth: 3 },
    { name: '여성', parent: 1, depth: 2 }, { name: '원피스', parent: 5, depth: 3 },
    { name: '가방', parent: 5, depth: 3 }, { name: '전자기기', parent: null, depth: 1 },
    { name: '모바일', parent: 8, depth: 2 }, { name: '이어폰', parent: 9, depth: 3 },
    { name: '충전기', parent: 9, depth: 3 }, { name: '생활용품', parent: null, depth: 1 },
  ];
  catDefs.forEach((c, i) => db.categories.push({ id: next('categories'), name: c.name, parentId: c.parent, depth: c.depth, sortOrder: i + 1 }));

  // ── 상품 50 ──
  for (let i = 0; i < 50; i++) {
    const hasOpt = i < 20;
    const catId = LEAF_CATS[i % LEAF_CATS.length];
    const base = 19000 + randInt(30) * 1000;
    const sale = Math.round((base - randInt(8) * 1000) / 1000) * 1000;
    const pid = next('products');
    db.products.push({
      id: pid, categoryId: catId, name: PRODUCT_NAMES[i] ?? `상품${i + 1}`,
      description: '프리미엄 소재로 제작된 데모 상품입니다. 실제 구매/배송/CS 플로우 시연용으로 제공됩니다.',
      basePrice: base, salePrice: sale, thumbnailUrl: PICSUM(i + 1),
      detailImages: JSON.stringify([1, 2, 3].map((k) => `https://picsum.photos/seed/mall-d${i + 1}-${k}/800/1000`)),
      status: 'ON_SALE', createdAt: addDays(nowISO(), -(50 - i)),
    });
    if (hasOpt) {
      const optId = next('options');
      const values: { id: number; value: string }[] = [];
      COLORS.forEach((c) => SIZES.forEach((s) => values.push({ id: next('optionValues'), value: `${c}/${s}` })));
      db.options.push({ id: optId, productId: pid, name: '옵션', values });
      values.forEach((v, vi) => {
        const ci = Math.floor(vi / SIZES.length), si = vi % SIZES.length;
        db.skus.push({ id: next('skus'), productId: pid, optionValueIds: JSON.stringify([v.id]), optionLabel: v.value.replace('/', ' / '), extraPrice: (ci + si) * 500, stock: 10 + randInt(40), isActive: 1 });
      });
    } else {
      db.skus.push({ id: next('skus'), productId: pid, optionValueIds: '[]', optionLabel: '기본', extraPrice: 0, stock: 10 + randInt(40), isActive: 1 });
    }
  }

  // ── 쿠폰 ──
  const couponDefs = [
    { name: '가입축하 3,000원', discountType: 'FIXED', discountValue: 3000, maxDiscount: null as number | null, minOrderAmount: 0, issueType: 'AUTO_SIGNUP', validDays: 30, totalQuantity: null as number | null, scope: 'ALL', scopeCategoryId: null as number | null, scopeProductId: null as number | null },
    { name: '10% 할인 (최대 5,000)', discountType: 'RATE', discountValue: 10, maxDiscount: 5000, minOrderAmount: 0, issueType: 'DOWNLOAD', validDays: 14, totalQuantity: null, scope: 'ALL', scopeCategoryId: null, scopeProductId: null },
    { name: '5만원 이상 5,000원', discountType: 'FIXED', discountValue: 5000, maxDiscount: null, minOrderAmount: 50000, issueType: 'DOWNLOAD', validDays: 14, totalQuantity: null, scope: 'ALL', scopeCategoryId: null, scopeProductId: null },
    { name: '패션카테고리 15% (최대 1만)', discountType: 'RATE', discountValue: 15, maxDiscount: 10000, minOrderAmount: 0, issueType: 'DOWNLOAD', validDays: 14, totalQuantity: null, scope: 'CATEGORY', scopeCategoryId: 1, scopeProductId: null },
    { name: '수량한정 20매 2,000원', discountType: 'FIXED', discountValue: 2000, maxDiscount: null, minOrderAmount: 10000, issueType: 'DOWNLOAD', validDays: 30, totalQuantity: 20, scope: 'ALL', scopeCategoryId: null, scopeProductId: null },
    { name: '이 상품 전용 5,000원', discountType: 'FIXED', discountValue: 5000, maxDiscount: null, minOrderAmount: 0, issueType: 'DOWNLOAD', validDays: 14, totalQuantity: null, scope: 'PRODUCT', scopeCategoryId: null, scopeProductId: 1 },
    { name: '이 상품 전용 10% 할인', discountType: 'RATE', discountValue: 10, maxDiscount: 3000, minOrderAmount: 0, issueType: 'DOWNLOAD', validDays: 14, totalQuantity: null, scope: 'PRODUCT', scopeCategoryId: null, scopeProductId: 2 },
    { name: '이 상품 전용 3,000원', discountType: 'FIXED', discountValue: 3000, maxDiscount: null, minOrderAmount: 20000, issueType: 'DOWNLOAD', validDays: 30, totalQuantity: null, scope: 'PRODUCT', scopeCategoryId: null, scopeProductId: 3 },
  ];
  couponDefs.forEach((c) => {
    const id = next('coupons');
    db.coupons.push({ id, ...c, issuedCount: 0, isActive: 1 });
    if (c.issueType === 'AUTO_SIGNUP') {
      userIds.forEach((uid) => db.userCoupons.push({ id: next('userCoupons'), userId: uid, couponId: id, status: 'UNUSED', issuedAt: nowISO(), expiresAt: addDays(nowISO(), c.validDays) }));
      db.coupons[db.coupons.length - 1].issuedCount = userIds.length;
    }
  });

  // ── 주문 30 (데모 계정 user1/user6 에 몰아주기 포함) ──
  const orderStatusPlan = [
    ...Array(10).fill('DELIVERED'), ...Array(5).fill('DELIVERING'), ...Array(5).fill('PREPARING'),
    ...Array(4).fill('PAID'), ...Array(4).fill('CONFIRMED'), ...Array(2).fill('CANCELED'),
  ] as string[];
  const shipmentStatusFor = (os: string) => os === 'PREPARING' ? 'READY' : os === 'DELIVERING' ? 'OUT_FOR_DELIVERY' : (os === 'DELIVERED' || os === 'CONFIRMED') ? 'DELIVERED' : 'READY';

  orderStatusPlan.forEach((status, idx) => {
    // 절반은 user1(VIP)·user6(BRONZE)에 배정해 데모 로그인 시 내역이 풍부하게 보이도록
    const uid = idx % 2 === 0 ? userIds[0] : idx % 4 === 1 ? userIds[5] : pick(userIds);
    const itemCount = 1 + randInt(2);
    const items: { skuId: number; productId: number; name: string; label: string; unit: number; qty: number }[] = [];
    for (let k = 0; k < itemCount; k++) {
      const prod = pick(db.products);
      const skus = db.skus.filter((s) => s.productId === prod.id);
      const s = pick(skus);
      const qty = 1 + randInt(2);
      items.push({ skuId: s.id, productId: prod.id, name: prod.name, label: s.optionLabel, unit: prod.salePrice + s.extraPrice, qty });
      if (status !== 'CANCELED') s.stock = Math.max(0, s.stock - qty);
    }
    const itemsTotal = items.reduce((s, it) => s + it.unit * it.qty, 0);
    const shippingFee = itemsTotal >= 50000 ? 0 : 3000;
    const payAmount = itemsTotal + shippingFee;
    // 최근 7일 매출 차트가 채워지도록 최근 날짜 위주 분포
    const created = addDays(nowISO(), -(idx < 6 ? Math.floor(idx / 2) : randInt(20)));
    const orderId = next('orders');
    const user = db.users.find((u) => u.id === uid)!;
    db.orders.push({
      id: orderId, orderNo: makeOrderNo(orderId, new Date(created)), userId: uid, status,
      itemsTotal, couponDiscount: 0, gradeDiscount: 0, pointsUsed: 0, shippingFee, payAmount,
      receiver: user.name, phone: '010-1234-5678', zipcode: '06236', addr1: '서울시 강남구 테헤란로 123', addr2: '101동 201호',
      createdAt: created, paidAt: status === 'CANCELED' ? null : created, userCouponId: null,
    });
    items.forEach((it) => db.orderItems.push({ id: next('orderItems'), orderId, skuId: it.skuId, productId: it.productId, productName: it.name, optionLabel: it.label, unitPrice: it.unit, quantity: it.qty, status: 'NORMAL' }));
    if (status !== 'PAID' && status !== 'CANCELED') {
      const ss = shipmentStatusFor(status);
      const upto = SHIP_SEQ.indexOf(ss);
      const events = SHIP_SEQ.slice(0, upto + 1).map((st, i) => ({ status: st, location: SHIP_LOC[st], at: addDays(created, i) }));
      db.shipments.push({ id: next('shipments'), orderId, carrier: 'VIRTUAL', trackingNo: trackingNo(orderId), status: ss, events });
    }
  });

  // ── 클레임: 반품 2(1 INSPECTING), 교환 1 ──
  const delivered = db.orders.filter((o) => o.status === 'DELIVERED');
  const confirmed = db.orders.filter((o) => o.status === 'CONFIRMED');
  const targets = [...delivered.slice(0, 2), ...confirmed.slice(0, 1)];
  const claimSpec = [
    { type: 'RETURN', status: 'INSPECTING', reason: '상품 불량', detail: '봉제 불량', inspectionResult: null as string | null, refund: false },
    { type: 'RETURN', status: 'REFUNDED', reason: '단순 변심', detail: '', inspectionResult: 'RESTOCK', refund: true },
    { type: 'EXCHANGE', status: 'COMPLETED', reason: '사이즈 교환', detail: '', inspectionResult: 'RESTOCK', refund: false },
  ];
  targets.forEach((o, i) => {
    const oi = db.orderItems.find((x) => x.orderId === o.id)!;
    const spec = claimSpec[i];
    db.claims.push({
      id: next('claims'), orderId: o.id, orderItemId: oi.id, userId: o.userId, type: spec.type,
      status: spec.status, reason: spec.reason, detail: spec.detail, inspectionResult: spec.inspectionResult,
      refundAmount: spec.refund ? oi.unitPrice * oi.quantity : spec.status === 'COMPLETED' ? 0 : null,
      refundPoints: spec.refund || spec.status === 'COMPLETED' ? 0 : null,
      createdAt: addDays(nowISO(), -1), resolvedAt: spec.status === 'INSPECTING' ? null : nowISO(),
    });
  });

  // ── 리뷰 25 ──
  const reviewable = [...delivered, ...confirmed];
  let rev = 0;
  for (const o of reviewable) {
    if (rev >= 25) break;
    for (const oi of db.orderItems.filter((x) => x.orderId === o.id)) {
      if (rev >= 25) break;
      if (db.reviews.some((r) => r.orderItemId === oi.id)) continue;
      db.reviews.push({
        id: next('reviews'), userId: o.userId, orderItemId: oi.id, productId: oi.productId,
        rating: 3 + randInt(2), content: pick(['좋습니다!', '배송 빠르고 품질 만족', '재구매 의사 있어요', '가성비 최고', '색상이 사진과 같아요']),
        isVisible: 1, createdAt: addDays(nowISO(), -randInt(10)),
      });
      rev++;
    }
  }

  // ── Q&A 10 (3 미답변) ──
  const qnaContents = ['재입고 예정 있나요?', '사이즈 표 좀 알려주세요', '세탁기 사용 가능한가요?', '배송 며칠 걸리나요?', '할인 중인데 품절인가요?', '옵션 추가 가능한가요?', '색상 다른 것도 있나요?', 'A/S 가능한가요?', '반품 비용 어떻게 되나요?', 'B2B 구매 가능?'];
  qnaContents.forEach((q, i) => {
    db.qnas.push({
      id: next('qnas'), userId: pick(userIds), productId: pick(db.products).id, question: q,
      answer: i >= 7 ? null : '안내해 드리겠습니다. 자세한 내용은 고객센터로 문의 부탁드립니다.',
      answeredAt: i >= 7 ? null : nowISO(), isSecret: 0, createdAt: addDays(nowISO(), -randInt(10)),
    });
  });

  // ── 알림 ──
  userIds.forEach((uid, i) => {
    db.notifications.push({ id: next('notifications'), userId: uid, type: 'ORDER', title: '주문 안내', body: '주문이 접수되었습니다.', link: '/my/orders', isRead: 0, createdAt: nowISO() });
    if (i === 0) db.notifications.push({ id: next('notifications'), userId: uid, type: 'COUPON', title: '쿠폰 만료 임박', body: '가입축하 쿠폰이 곧 만료됩니다.', link: '/my/coupons', isRead: 0, createdAt: nowISO() });
  });

  // ── 재고 보정: 전 SKU 품절 상품 복구 + 저재고 데모 6건 ──
  for (const p of db.products) {
    const skus = db.skus.filter((s) => s.productId === p.id);
    if (skus.length && skus.every((s) => s.stock === 0)) skus[0].stock = 20;
  }
  for (let i = 0; i < 6; i++) {
    const s = db.skus[Math.floor(rand() * db.skus.length)];
    const others = db.skus.filter((x) => x.productId === s.productId && x.id !== s.id);
    if (others.length || s.stock > 0) s.stock = 3 + randInt(2);
  }

  return db;
}

let db: MockDb | null = null;

export function getDb(): MockDb {
  if (db) return db;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) { db = JSON.parse(raw) as MockDb; return db; }
  } catch { /* 손상 시 재시드 */ }
  db = buildSeed();
  saveDb();
  return db;
}

export function saveDb() {
  if (!db) return;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(db)); } catch { /* 저장 실패는 무시 (시크릿 모드 등) */ }
}

export function resetDb() {
  db = buildSeed();
  saveDb();
}

export const nextId = (k: string) => { const d = getDb(); d.seq[k] = (d.seq[k] ?? 0) + 1; return d.seq[k]; };

// 콘솔에서 데이터 초기화: window.__resetMallDemo()
if (typeof window !== 'undefined') (window as any).__resetMallDemo = () => { resetDb(); location.reload(); };
