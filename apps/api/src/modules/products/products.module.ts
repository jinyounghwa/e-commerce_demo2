import { Module } from '@nestjs/common';

import { Controller, Get, Param, Query } from '@nestjs/common';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { getDb, schema } from '../../db/client';
import { num } from '../../common/zod';
import { descendantCategoryIds } from '../../common/category-tree';

@Controller()
export class ProductsController {
  // ── 카테고리 트리 ──
  @Get('categories')
  categories() {
    const db = getDb();
    const all = db.select().from(schema.categories).orderBy(asc(schema.categories.sortOrder)).all();
    const build = (parentId: number | null): any[] =>
      all.filter((c) => c.parentId === parentId).map((c) => ({ ...c, children: build(c.id) }));
    return build(null);
  }

  // ── 상품 목록 ──
  @Get('products')
  list(
    @Query('category') category?: string,
    @Query('q') q?: string,
    @Query('sort') sort?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const db = getDb();
    const pg = num(page, 1);
    const lim = num(limit, 20);
    const offset = (pg - 1) * lim;

    const conds: any[] = [eq(schema.products.status, 'ON_SALE')];
    if (category) {
      const ids = descendantCategoryIds(Number(category));
      conds.push(inArray(schema.products.categoryId, ids));
    }
    if (q) {
      conds.push(sql`${schema.products.name} LIKE ${'%' + q + '%'}`);
    }

    let orderBy: any;
    switch (sort) {
      case 'priceAsc': orderBy = asc(schema.products.salePrice); break;
      case 'priceDesc': orderBy = desc(schema.products.salePrice); break;
      case 'rating': orderBy = desc(schema.products.id); break; // 데모: id 순 (평점 집계 생략 단순화)
      default: orderBy = desc(schema.products.createdAt);
    }

    const rows = db.select({
      id: schema.products.id, name: schema.products.name,
      basePrice: schema.products.basePrice, salePrice: schema.products.salePrice,
      thumbnailUrl: schema.products.thumbnailUrl, status: schema.products.status,
      categoryId: schema.products.categoryId, createdAt: schema.products.createdAt,
    }).from(schema.products).where(and(...conds)).orderBy(orderBy).limit(lim).offset(offset).all();

    const total = db.select({ c: sql<number>`count(*)` }).from(schema.products).where(and(...conds)).get()!.c;
    return { items: rows, total, page: pg, limit: lim, totalPages: Math.ceil(total / lim) };
  }

  // ── 상품 상세 ──
  @Get('products/:id')
  detail(@Param('id') id: number) {
    const db = getDb();
    const product = db.select().from(schema.products).where(eq(schema.products.id, id)).get();
    if (!product) return { error: 'NOT_FOUND' };

    const skus = db.select().from(schema.skus).where(eq(schema.skus.productId, id)).all();
    const options = db.select().from(schema.productOptions).where(eq(schema.productOptions.productId, id)).all();
    const optionValues = options.length
      ? db.select().from(schema.productOptionValues)
          .where(inArray(schema.productOptionValues.optionId, options.map((o) => o.id))).all()
      : [];

    // 리뷰 요약
    const reviewAgg = db.select({
      avg: sql<number>`COALESCE(AVG(${schema.reviews.rating}),0)`,
      count: sql<number>`COUNT(*)`,
    }).from(schema.reviews)
      .where(and(eq(schema.reviews.productId, id), eq(schema.reviews.isVisible, 1))).get()!;

    const category = db.select().from(schema.categories).where(eq(schema.categories.id, product.categoryId)).get();

    const totalStock = skus.reduce((s, k) => s + k.stock, 0);
    return {
      ...product,
      category,
      options: options.map((o) => ({
        ...o,
        values: optionValues.filter((v) => v.optionId === o.id),
      })),
      skus: skus.map((s) => ({ ...s, isSoldOut: s.stock <= 0 })),
      totalStock,
      reviewAvg: Math.round(reviewAgg.avg * 10) / 10,
      reviewCount: reviewAgg.count,
    };
  }

  // ── 이 상품에 적용 가능한 쿠폰 (ALL + CATEGORY + PRODUCT) ──
  @Get('products/:id/coupons')
  productCoupons(@Param('id') id: number) {
    const db = getDb();
    const pid = Number(id);
    const product = db.select().from(schema.products).where(eq(schema.products.id, pid)).get();
    if (!product) return [];
    const all = db.select().from(schema.coupons).where(eq(schema.coupons.isActive, 1)).all();
    return all
      .filter((c) => {
        if (c.issueType !== 'DOWNLOAD') return false;
        if (c.scope === 'ALL') return true;
        if (c.scope === 'PRODUCT') return c.scopeProductId === pid;
        if (c.scope === 'CATEGORY' && c.scopeCategoryId) {
          return descendantCategoryIds(c.scopeCategoryId).includes(product.categoryId);
        }
        return false;
      })
      .map((c) => ({
        id: c.id, name: c.name, discountType: c.discountType, discountValue: c.discountValue,
        maxDiscount: c.maxDiscount, minOrderAmount: c.minOrderAmount, scope: c.scope,
        scopeProductId: c.scopeProductId, validDays: c.validDays,
        remaining: c.totalQuantity == null ? null : Math.max(0, c.totalQuantity - c.issuedCount),
      }));
  }

  // ── 상품 리뷰 목록 ──
  @Get('products/:id/reviews')
  reviews(@Param('id') id: number, @Query('page') page?: string) {
    const db = getDb();
    const pg = num(page, 1);
    const lim = 10;
    return db.select({
      id: schema.reviews.id, rating: schema.reviews.rating, content: schema.reviews.content,
      adminReply: schema.reviews.adminReply, createdAt: schema.reviews.createdAt,
      userName: schema.users.name,
    }).from(schema.reviews).innerJoin(schema.users, eq(schema.reviews.userId, schema.users.id))
      .where(and(eq(schema.reviews.productId, id), eq(schema.reviews.isVisible, 1)))
      .orderBy(desc(schema.reviews.createdAt)).limit(lim).offset((pg - 1) * lim).all();
  }

  // ── 상품 Q&A 목록 ──
  @Get('products/:id/qnas')
  qnas(@Param('id') id: number) {
    const db = getDb();
    return db.select({
      id: schema.qnas.id, question: schema.qnas.question, answer: schema.qnas.answer,
      isSecret: schema.qnas.isSecret, answeredAt: schema.qnas.answeredAt, createdAt: schema.qnas.createdAt,
      userName: schema.users.name,
    }).from(schema.qnas).innerJoin(schema.users, eq(schema.qnas.userId, schema.users.id))
      .where(eq(schema.qnas.productId, id)).orderBy(desc(schema.qnas.createdAt)).all();
  }
}

@Module({ controllers: [ProductsController] })
export class ProductsModule {}
