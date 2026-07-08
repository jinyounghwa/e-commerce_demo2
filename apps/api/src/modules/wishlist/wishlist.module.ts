import { Module } from '@nestjs/common';

import { Controller, Delete, Get, Param, Post, Body, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { and, eq, desc } from 'drizzle-orm';
import { getDb, schema } from '../../db/client';
import { parse } from '../../common/zod';
import { Auth, CurrentUser } from '../../common/auth.guard';

const schema_ = z.object({ productId: z.number() });

@Controller('wishlist')
export class WishlistController {
  @Get()
  @Auth('USER', 'ADMIN')
  list(@CurrentUser() u: any) {
    const db = getDb();
    return db.select({
      id: schema.wishlists.id, productId: schema.products.id, name: schema.products.name,
      salePrice: schema.products.salePrice, thumbnailUrl: schema.products.thumbnailUrl, status: schema.products.status,
    }).from(schema.wishlists).innerJoin(schema.products, eq(schema.wishlists.productId, schema.products.id))
      .where(eq(schema.wishlists.userId, u.id)).orderBy(desc(schema.wishlists.createdAt)).all();
  }

  @Post()
  @Auth('USER', 'ADMIN')
  add(@CurrentUser() u: any, @Body() body: unknown) {
    const dto = parse(schema_, body);
    const db = getDb();
    if (!db.select().from(schema.products).where(eq(schema.products.id, dto.productId)).get()) {
      throw new NotFoundException('상품 없음');
    }
    const existing = db.select().from(schema.wishlists)
      .where(and(eq(schema.wishlists.userId, u.id), eq(schema.wishlists.productId, dto.productId))).get();
    if (!existing) {
      db.insert(schema.wishlists).values({ userId: u.id, productId: dto.productId }).run();
    }
    return { ok: true };
  }

  @Delete(':productId')
  @Auth('USER', 'ADMIN')
  remove(@CurrentUser() u: any, @Param('productId') productId: number) {
    getDb().delete(schema.wishlists)
      .where(and(eq(schema.wishlists.userId, u.id), eq(schema.wishlists.productId, productId))).run();
    return { ok: true };
  }
}

@Module({ controllers: [WishlistController] })
export class WishlistModule {}
