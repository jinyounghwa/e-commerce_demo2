import { Module } from '@nestjs/common';

import { Body, Controller, Post, BadRequestException, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { getDb, schema } from '../../db/client';
import { parse } from '../../common/zod';
import { Auth, CurrentUser } from '../../common/auth.guard';
import { nowISO } from '../../common/util';

const schema_ = z.object({
  productId: z.number(),
  question: z.string().min(2),
  isSecret: z.boolean().optional(),
});

@Controller('qnas')
export class QnaController {
  @Post()
  @Auth('USER', 'ADMIN')
  create(@CurrentUser() u: any, @Body() body: unknown) {
    const dto = parse(schema_, body);
    const db = getDb();
    if (!db.select().from(schema.products).where(eq(schema.products.id, dto.productId)).get()) {
      throw new NotFoundException('상품 없음');
    }
    const r = db.insert(schema.qnas).values({
      userId: u.id, productId: dto.productId, question: dto.question,
      answer: null, isSecret: dto.isSecret ? 1 : 0, answeredAt: null, createdAt: nowISO(),
    }).returning({ id: schema.qnas.id }).get();
    return { ok: true, qnaId: r.id };
  }
}

@Module({ controllers: [QnaController] })
export class QnaModule {}
