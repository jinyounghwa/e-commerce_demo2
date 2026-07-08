// Drizzle ORM 스키마 정의 — SKILL.md §2
import { sqliteTable, integer, text, uniqueIndex, index, AnySQLiteColumn } from 'drizzle-orm/sqlite-core';

// ── 회원 ──────────────────────────────────────────────
export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name: text('name').notNull(),
  role: text('role').notNull().default('USER'), // USER | ADMIN
  grade: text('grade').notNull().default('BRONZE'), // BRONZE|SILVER|GOLD|VIP
  totalSpent: integer('total_spent').notNull().default(0),
  pointBalance: integer('point_balance').notNull().default(0),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
});

export const addresses = sqliteTable('addresses', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  label: text('label').notNull(),
  receiver: text('receiver').notNull(),
  phone: text('phone').notNull(),
  zipcode: text('zipcode').notNull(),
  addr1: text('addr1').notNull(),
  addr2: text('addr2'),
  isDefault: integer('is_default').notNull().default(0),
});

// ── 카테고리 / 상품 ───────────────────────────────────
export const categories = sqliteTable('categories', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  parentId: integer('parent_id').references((): AnySQLiteColumn => categories.id, { onDelete: 'set null' }),
  depth: integer('depth').notNull().default(1),
  sortOrder: integer('sort_order').notNull().default(0),
});

export const products = sqliteTable('products', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  categoryId: integer('category_id').notNull().references(() => categories.id),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  basePrice: integer('base_price').notNull(),
  salePrice: integer('sale_price').notNull(),
  thumbnailUrl: text('thumbnail_url').notNull(),
  detailImages: text('detail_images').notNull().default('[]'), // JSON 배열 ["url",...]
  status: text('status').notNull().default('ON_SALE'), // ON_SALE|HIDDEN|SOLD_OUT
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
});

export const productOptions = sqliteTable('product_options', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  productId: integer('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
});

export const productOptionValues = sqliteTable('product_option_values', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  optionId: integer('option_id').notNull().references(() => productOptions.id, { onDelete: 'cascade' }),
  value: text('value').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
});

export const skus = sqliteTable('skus', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  productId: integer('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  optionValueIds: text('option_value_ids').notNull().default('[]'), // JSON "[1,5]"
  optionLabel: text('option_label').notNull().default('기본'),
  extraPrice: integer('extra_price').notNull().default(0),
  stock: integer('stock').notNull().default(0),
  isActive: integer('is_active').notNull().default(1),
});

// ── 장바구니 / 찜 ─────────────────────────────────────
export const cartItems = sqliteTable('cart_items', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  skuId: integer('sku_id').notNull().references(() => skus.id, { onDelete: 'cascade' }),
  quantity: integer('quantity').notNull().default(1),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
}, (t) => ({
  uniq: uniqueIndex('cart_uniq').on(t.userId, t.skuId),
}));

export const wishlists = sqliteTable('wishlists', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  productId: integer('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
}, (t) => ({
  uniq: uniqueIndex('wish_uniq').on(t.userId, t.productId),
}));

// ── 쿠폰 ──────────────────────────────────────────────
export const coupons = sqliteTable('coupons', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  discountType: text('discount_type').notNull(), // FIXED | RATE
  discountValue: integer('discount_value').notNull(),
  maxDiscount: integer('max_discount'),
  minOrderAmount: integer('min_order_amount').notNull().default(0),
  issueType: text('issue_type').notNull(), // DOWNLOAD | AUTO_SIGNUP | ADMIN
  validDays: integer('valid_days').notNull().default(30),
  totalQuantity: integer('total_quantity'),
  issuedCount: integer('issued_count').notNull().default(0),
  scope: text('scope').notNull().default('ALL'), // ALL | CATEGORY | PRODUCT
  scopeCategoryId: integer('scope_category_id'),
  scopeProductId: integer('scope_product_id'),
  isActive: integer('is_active').notNull().default(1),
});

export const userCoupons = sqliteTable('user_coupons', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  couponId: integer('coupon_id').notNull().references(() => coupons.id, { onDelete: 'cascade' }),
  status: text('status').notNull().default('UNUSED'), // UNUSED | USED | EXPIRED
  issuedAt: text('issued_at').notNull().$defaultFn(() => new Date().toISOString()),
  expiresAt: text('expires_at').notNull(),
  usedAt: text('used_at'),
  usedOrderId: integer('used_order_id'),
}, (t) => ({
  uniq: uniqueIndex('uc_uniq').on(t.userId, t.couponId),
}));

// ── 포인트 원장 ───────────────────────────────────────
export const pointLedger = sqliteTable('point_ledger', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  amount: integer('amount').notNull(), // +적립 / -사용
  type: text('type').notNull(), // EARN_ORDER|USE_ORDER|REFUND|ADMIN|EXPIRE
  refOrderId: integer('ref_order_id'),
  memo: text('memo').notNull().default(''),
  expiresAt: text('expires_at'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
});

// ── 주문 / 결제 / 배송 ─────────────────────────────────
export const orders = sqliteTable('orders', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  orderNo: text('order_no').notNull().unique(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  status: text('status').notNull().default('PENDING_PAYMENT'),
  itemsTotal: integer('items_total').notNull().default(0),
  couponDiscount: integer('coupon_discount').notNull().default(0),
  gradeDiscount: integer('grade_discount').notNull().default(0),
  pointsUsed: integer('points_used').notNull().default(0),
  shippingFee: integer('shipping_fee').notNull().default(0),
  payAmount: integer('pay_amount').notNull().default(0),
  usedUserCouponId: integer('used_user_coupon_id'),
  receiver: text('receiver').notNull(),
  phone: text('phone').notNull(),
  zipcode: text('zipcode').notNull(),
  addr1: text('addr1').notNull(),
  addr2: text('addr2'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  paidAt: text('paid_at'),
}, (t) => ({ userIdx: index('order_user_idx').on(t.userId) }));

export const orderItems = sqliteTable('order_items', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  orderId: integer('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  skuId: integer('sku_id').notNull().references(() => skus.id),
  productId: integer('product_id').notNull().references(() => products.id),
  productName: text('product_name').notNull(),
  optionLabel: text('option_label').notNull(),
  unitPrice: integer('unit_price').notNull(),
  quantity: integer('quantity').notNull(),
  status: text('status').notNull().default('NORMAL'), // NORMAL|CLAIMED
});

export const payments = sqliteTable('payments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  orderId: integer('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  method: text('method').notNull(), // MOCK_CARD | MOCK_BANK
  status: text('status').notNull(), // SUCCESS | FAILED
  failReason: text('fail_reason'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
});

export const shipments = sqliteTable('shipments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  orderId: integer('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  carrier: text('carrier').notNull().default('가상택배'),
  trackingNo: text('tracking_no').notNull(),
  status: text('status').notNull().default('READY'), // READY|PICKED_UP|IN_TRANSIT|OUT_FOR_DELIVERY|DELIVERED
  events: text('events').notNull().default('[]'),
});

// ── CS (클레임) ───────────────────────────────────────
export const claims = sqliteTable('claims', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  orderId: integer('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  orderItemId: integer('order_item_id').notNull().references(() => orderItems.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: text('type').notNull(), // CANCEL | RETURN | EXCHANGE
  status: text('status').notNull().default('REQUESTED'),
  reason: text('reason').notNull(),
  detail: text('detail'),
  inspectionResult: text('inspection_result'), // RESTOCK | DISPOSE
  refundAmount: integer('refund_amount'),
  refundPoints: integer('refund_points'),
  exchangeSkuId: integer('exchange_sku_id'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  resolvedAt: text('resolved_at'),
});

// ── 리뷰 / Q&A / 알림 ─────────────────────────────────
export const reviews = sqliteTable('reviews', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  orderItemId: integer('order_item_id').notNull().references(() => orderItems.id, { onDelete: 'cascade' }),
  productId: integer('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  rating: integer('rating').notNull(),
  content: text('content').notNull(),
  isVisible: integer('is_visible').notNull().default(1),
  adminReply: text('admin_reply'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
}, (t) => ({ uniq: uniqueIndex('review_uniq').on(t.orderItemId) }));

export const qnas = sqliteTable('qnas', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  productId: integer('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  question: text('question').notNull(),
  answer: text('answer'),
  isSecret: integer('is_secret').notNull().default(0),
  answeredAt: text('answered_at'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
});

export const notifications = sqliteTable('notifications', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: text('type').notNull(), // ORDER|COUPON|QNA|CLAIM
  title: text('title').notNull(),
  body: text('body').notNull(),
  link: text('link'),
  isRead: integer('is_read').notNull().default(0),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
});
