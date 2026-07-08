import { Body, Controller, Delete, Get, Param, Patch, Post, NotFoundException, ConflictException } from '@nestjs/common';
import { z } from 'zod';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { getDb, schema } from '../../db/client';
import { parse } from '../../common/zod';
import { Auth } from '../../common/auth.guard';

// ── 카테고리 ──
const catSchema = z.object({
  name: z.string(), parentId: z.number().nullable().optional(), sortOrder: z.number().optional(),
});

// ── 상품 ──
const productSchema = z.object({
  name: z.string(), categoryId: z.number(), description: z.string().optional(),
  basePrice: z.number(), salePrice: z.number(), thumbnailUrl: z.string(),
  status: z.enum(['ON_SALE', 'HIDDEN', 'SOLD_OUT']).optional(),
  detailImages: z.string().optional(), // 줄바꿈/쉼표 구분 URL
  options: z.array(z.object({ name: z.string(), values: z.array(z.string()) })).optional(),
});
const productUpdateSchema = productSchema.partial();

// ── 쿠폰 ──
const couponSchema = z.object({
  name: z.string(), discountType: z.enum(['FIXED', 'RATE']), discountValue: z.number(),
  maxDiscount: z.number().nullable().optional(), minOrderAmount: z.number().default(0),
  issueType: z.enum(['DOWNLOAD', 'AUTO_SIGNUP', 'ADMIN']), validDays: z.number().default(30),
  totalQuantity: z.number().nullable().optional(), scope: z.enum(['ALL', 'CATEGORY', 'PRODUCT']).default('ALL'),
  scopeCategoryId: z.number().nullable().optional(),
  scopeProductId: z.number().nullable().optional(),
});

// 옵션값 데카르트 곱
function cartesian(groups: { name: string; valueIds: number[]; values: string[] }[]): { ids: number[]; label: string }[] {
  if (groups.length === 0) return [{ ids: [], label: '기본' }];
  return groups.reduce<{ ids: number[]; label: string }[]>(
    (acc, g, gi) => {
      if (acc.length === 0) return g.valueIds.map((id, i) => ({ ids: [id], label: g.values[i] }));
      return acc.flatMap((a) => g.valueIds.map((id, i) => ({ ids: [...a.ids, id], label: a.label + ' / ' + g.values[i] })));
    },
    [],
  );
}

@Controller()
export class AdminCatalogController {
  // ── 카테고리 ──
  @Get('admin/categories')
  @Auth('ADMIN')
  categories() {
    const all = getDb().select().from(schema.categories).all();
    const build = (parentId: number | null): any[] =>
      all.filter((c) => c.parentId === parentId).map((c) => ({ ...c, children: build(c.id) }));
    return build(null);
  }

  @Post('admin/categories')
  @Auth('ADMIN')
  createCategory(@Body() body: unknown) {
    const dto = parse(catSchema, body);
    const db = getDb();
    let depth = 1;
    if (dto.parentId) {
      const p = db.select().from(schema.categories).where(eq(schema.categories.id, dto.parentId)).get();
      if (!p) throw new NotFoundException('부모 카테고리 없음');
      depth = p.depth + 1;
      if (depth > 3) throw new ConflictException('카테고리는 3-depth까지 가능');
    }
    return db.insert(schema.categories).values({
      name: dto.name, parentId: dto.parentId ?? null, depth, sortOrder: dto.sortOrder ?? 0,
    }).returning().get();
  }

  @Patch('admin/categories/:id')
  @Auth('ADMIN')
  updateCategory(@Param('id') id: number, @Body() body: unknown) {
    const dto = parse(catSchema.partial(), body);
    const db = getDb();
    db.update(schema.categories).set({
      ...(dto.name != null && { name: dto.name }),
      ...(dto.sortOrder != null && { sortOrder: dto.sortOrder }),
    }).where(eq(schema.categories.id, id)).run();
    return { ok: true };
  }

  @Delete('admin/categories/:id')
  @Auth('ADMIN')
  deleteCategory(@Param('id') id: number) {
    getDb().delete(schema.categories).where(eq(schema.categories.id, id)).run();
    return { ok: true };
  }

  // ── 상품 ──
  @Get('admin/products')
  @Auth('ADMIN')
  products() {
    const db = getDb();
    return db.select({
      id: schema.products.id, name: schema.products.name, basePrice: schema.products.basePrice,
      salePrice: schema.products.salePrice, thumbnailUrl: schema.products.thumbnailUrl,
      status: schema.products.status, categoryId: schema.products.categoryId,
      categoryName: schema.categories.name, createdAt: schema.products.createdAt,
      totalStock: sql<number>`COALESCE((SELECT SUM(stock) FROM skus WHERE product_id = ${schema.products.id}),0)`,
    }).from(schema.products).innerJoin(schema.categories, eq(schema.products.categoryId, schema.categories.id))
      .orderBy(schema.products.id).all();
  }

  @Get('admin/products/:id')
  @Auth('ADMIN')
  productDetail(@Param('id') id: number) {
    const db = getDb();
    const product = db.select().from(schema.products).where(eq(schema.products.id, id)).get();
    if (!product) throw new NotFoundException('상품 없음');
    const options = db.select().from(schema.productOptions).where(eq(schema.productOptions.productId, id)).all();
    const optionValues = options.length
      ? db.select().from(schema.productOptionValues)
          .where(inArray(schema.productOptionValues.optionId, options.map((o) => o.id))).all()
      : [];
    const skus = db.select().from(schema.skus).where(eq(schema.skus.productId, id)).all();
    return { ...product, options: options.map((o) => ({ ...o, values: optionValues.filter((v) => v.optionId === o.id) })), skus };
  }

  @Post('admin/products')
  @Auth('ADMIN')
  createProduct(@Body() body: unknown) {
    const dto = parse(productSchema, body);
    const db = getDb();
    return db.transaction(() => {
      const p = db.insert(schema.products).values({
        name: dto.name, categoryId: dto.categoryId, description: dto.description ?? '',
        basePrice: dto.basePrice, salePrice: dto.salePrice, thumbnailUrl: dto.thumbnailUrl,
        status: dto.status ?? 'ON_SALE',
      }).returning({ id: schema.products.id }).get();
      // 상세 이미지: 입력값 우선, 없으면 상품 ID 기반 자동 생성
      const detailUrls = (dto.detailImages ?? '').split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
      const detailImages = detailUrls.length
        ? JSON.stringify(detailUrls)
        : JSON.stringify([1, 2, 3].map((n) => `https://picsum.photos/seed/mall-new-${p.id}-${n}/800/1000`));
      db.update(schema.products).set({ detailImages }).where(eq(schema.products.id, p.id)).run();

      const opts = dto.options ?? [];
      if (opts.length === 0) {
        db.insert(schema.skus).values({
          productId: p.id, optionValueIds: '[]', optionLabel: '기본', extraPrice: 0, stock: 0, isActive: 1,
        }).run();
      } else {
        const groups: { name: string; valueIds: number[]; values: string[] }[] = [];
        opts.forEach((o, oi) => {
          const opt = db.insert(schema.productOptions).values({
            productId: p.id, name: o.name, sortOrder: oi,
          }).returning({ id: schema.productOptions.id }).get();
          const valueIds: number[] = [];
          o.values.forEach((v, vi) => {
            const vv = db.insert(schema.productOptionValues).values({
              optionId: opt.id, value: v, sortOrder: vi,
            }).returning({ id: schema.productOptionValues.id }).get();
            valueIds.push(vv.id);
          });
          groups.push({ name: o.name, valueIds, values: o.values });
        });
        const combos = cartesian(groups);
        combos.forEach((c, ci) => {
          db.insert(schema.skus).values({
            productId: p.id, optionValueIds: JSON.stringify(c.ids), optionLabel: c.label,
            extraPrice: 0, stock: 0, isActive: 1,
          }).run();
        });
      }
      return { ok: true, id: p.id };
    });
  }

  @Patch('admin/products/:id')
  @Auth('ADMIN')
  updateProduct(@Param('id') id: number, @Body() body: unknown) {
    const dto = parse(productUpdateSchema, body);
    const db = getDb();
    db.update(schema.products).set({
      ...(dto.name != null && { name: dto.name }),
      ...(dto.categoryId != null && { categoryId: dto.categoryId }),
      ...(dto.description != null && { description: dto.description }),
      ...(dto.basePrice != null && { basePrice: dto.basePrice }),
      ...(dto.salePrice != null && { salePrice: dto.salePrice }),
      ...(dto.thumbnailUrl != null && { thumbnailUrl: dto.thumbnailUrl }),
      ...(dto.status != null && { status: dto.status }),
      ...(dto.detailImages != null && { detailImages: JSON.stringify(dto.detailImages.split(/[\n,]/).map((s) => s.trim()).filter(Boolean)) }),
    }).where(eq(schema.products.id, id)).run();
    return { ok: true };
  }

  @Delete('admin/products/:id')
  @Auth('ADMIN')
  deleteProduct(@Param('id') id: number) {
    getDb().delete(schema.products).where(eq(schema.products.id, id)).run();
    return { ok: true };
  }

  // ── SKU ──
  @Patch('admin/skus/:id')
  @Auth('ADMIN')
  updateSku(@Param('id') id: number, @Body() body: unknown) {
    const dto = parse(z.object({
      stock: z.number().optional(), extraPrice: z.number().optional(), isActive: z.number().optional(),
    }), body);
    const db = getDb();
    db.update(schema.skus).set({
      ...(dto.stock != null && { stock: dto.stock }),
      ...(dto.extraPrice != null && { extraPrice: dto.extraPrice }),
      ...(dto.isActive != null && { isActive: dto.isActive }),
    }).where(eq(schema.skus.id, id)).run();
    return { ok: true };
  }

  // ── 쿠폰 ──
  @Get('admin/coupons')
  @Auth('ADMIN')
  coupons() {
    return getDb().select().from(schema.coupons).all();
  }

  @Post('admin/coupons')
  @Auth('ADMIN')
  createCoupon(@Body() body: unknown) {
    const dto = parse(couponSchema, body);
    return getDb().insert(schema.coupons).values({
      name: dto.name, discountType: dto.discountType, discountValue: dto.discountValue,
      maxDiscount: dto.maxDiscount ?? null, minOrderAmount: dto.minOrderAmount,
      issueType: dto.issueType, validDays: dto.validDays, totalQuantity: dto.totalQuantity ?? null,
      issuedCount: 0, scope: dto.scope, scopeCategoryId: dto.scopeCategoryId ?? null, scopeProductId: dto.scopeProductId ?? null, isActive: 1,
    }).returning().get();
  }

  @Patch('admin/coupons/:id')
  @Auth('ADMIN')
  updateCoupon(@Param('id') id: number, @Body() body: unknown) {
    const dto = parse(z.object({
      name: z.string().optional(),
      isActive: z.number().optional(),
      totalQuantity: z.number().nullable().optional(),
    }), body);
    const db = getDb();
    db.update(schema.coupons).set({
      ...(dto.name != null && { name: dto.name }),
      ...(dto.isActive != null && { isActive: dto.isActive }),
      ...(dto.totalQuantity != null && { totalQuantity: dto.totalQuantity }),
    }).where(eq(schema.coupons.id, id)).run();
    return { ok: true };
  }

  @Get('admin/coupons/:id/stats')
  @Auth('ADMIN')
  couponStats(@Param('id') id: number) {
    const db = getDb();
    const coupon = db.select().from(schema.coupons).where(eq(schema.coupons.id, id)).get();
    if (!coupon) throw new NotFoundException('쿠폰 없음');
    const issued = db.select().from(schema.userCoupons).where(eq(schema.userCoupons.couponId, id)).all();
    const used = issued.filter((u) => u.status === 'USED').length;
    return {
      ...coupon,
      issuedCount: issued.length,
      usedCount: used,
      usageRate: issued.length ? Math.round((used / issued.length) * 100) : 0,
    };
  }
}
