import { Module } from '@nestjs/common';

import { Body, Controller, Delete, Get, Param, Patch, Post, ConflictException, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { getDb, schema } from '../../db/client';
import { parse } from '../../common/zod';
import { Auth, CurrentUser } from '../../common/auth.guard';

const addSchema = z.object({ skuId: z.number(), quantity: z.number().int().min(1).default(1) });
const updateSchema = z.object({ quantity: z.number().int().min(1) });

@Controller('cart')
export class CartController {
  @Get()
  @Auth('USER', 'ADMIN')
  list(@CurrentUser() u: any) {
    const db = getDb();
    const items = db.select({
      id: schema.cartItems.id, quantity: schema.cartItems.quantity,
      skuId: schema.skus.id, stock: schema.skus.stock, extraPrice: schema.skus.extraPrice,
      optionLabel: schema.skus.optionLabel,
      productId: schema.products.id, productName: schema.products.name,
      salePrice: schema.products.salePrice, thumbnailUrl: schema.products.thumbnailUrl,
      productStatus: schema.products.status,
    }).from(schema.cartItems)
      .innerJoin(schema.skus, eq(schema.cartItems.skuId, schema.skus.id))
      .innerJoin(schema.products, eq(schema.skus.productId, schema.products.id))
      .where(eq(schema.cartItems.userId, u.id)).all();
    return items.map((i) => ({
      ...i,
      unitPrice: i.salePrice + i.extraPrice,
      isSoldOut: i.stock <= 0 || i.productStatus === 'SOLD_OUT',
    }));
  }

  @Post()
  @Auth('USER', 'ADMIN')
  add(@CurrentUser() u: any, @Body() body: unknown) {
    const dto = parse(addSchema, body);
    const db = getDb();
    const sku = db.select().from(schema.skus).where(eq(schema.skus.id, dto.skuId)).get();
    if (!sku) throw new NotFoundException('SKU 없음');
    if (sku.stock < dto.quantity) throw new ConflictException('재고 부족');
    const existing = db.select().from(schema.cartItems)
      .where(and(eq(schema.cartItems.userId, u.id), eq(schema.cartItems.skuId, dto.skuId))).get();
    if (existing) {
      db.update(schema.cartItems).set({ quantity: existing.quantity + dto.quantity })
        .where(eq(schema.cartItems.id, existing.id)).run();
    } else {
      db.insert(schema.cartItems).values({ userId: u.id, skuId: dto.skuId, quantity: dto.quantity }).run();
    }
    return { ok: true };
  }

  @Patch(':id')
  @Auth('USER', 'ADMIN')
  update(@CurrentUser() u: any, @Param('id') id: number, @Body() body: unknown) {
    const dto = parse(updateSchema, body);
    getDb().update(schema.cartItems).set({ quantity: dto.quantity })
      .where(and(eq(schema.cartItems.id, id), eq(schema.cartItems.userId, u.id))).run();
    return { ok: true };
  }

  @Delete(':id')
  @Auth('USER', 'ADMIN')
  remove(@CurrentUser() u: any, @Param('id') id: number) {
    getDb().delete(schema.cartItems)
      .where(and(eq(schema.cartItems.id, id), eq(schema.cartItems.userId, u.id))).run();
    return { ok: true };
  }
}

@Module({ controllers: [CartController] })
export class CartModule {}
