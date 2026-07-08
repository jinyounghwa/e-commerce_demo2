import { Module } from '@nestjs/common';

import { Body, Controller, Post, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { getDb, schema } from '../../db/client';
import { parse } from '../../common/zod';
import { Auth, CurrentUser } from '../../common/auth.guard';
import { nowISO } from '../../common/util';

const schema_ = z.object({
  orderItemId: z.number(),
  rating: z.number().int().min(1).max(5),
  content: z.string().min(5),
});

@Controller('reviews')
export class ReviewsController {
  @Post()
  @Auth('USER', 'ADMIN')
  create(@CurrentUser() u: any, @Body() body: unknown) {
    const dto = parse(schema_, body);
    const db = getDb();
    const item = db.select().from(schema.orderItems).where(eq(schema.orderItems.id, dto.orderItemId)).get();
    if (!item) throw new NotFoundException('주문 아이템 없음');
    const order = db.select().from(schema.orders).where(eq(schema.orders.id, item.orderId)).get()!;
    if (order.userId !== u.id) throw new BadRequestException('본인 주문 아님');
    if (!['DELIVERED', 'CONFIRMED'].includes(order.status)) {
      throw new BadRequestException('배송완료 후 리뷰 작성 가능');
    }
    const existing = db.select().from(schema.reviews).where(eq(schema.reviews.orderItemId, dto.orderItemId)).get();
    if (existing) throw new ConflictException('이미 작성된 리뷰');
    const r = db.insert(schema.reviews).values({
      userId: u.id, orderItemId: dto.orderItemId, productId: item.productId,
      rating: dto.rating, content: dto.content, isVisible: 1, createdAt: nowISO(),
    }).returning({ id: schema.reviews.id }).get();
    return { ok: true, reviewId: r.id };
  }
}

@Module({ controllers: [ReviewsController] })
export class ReviewsModule {}
