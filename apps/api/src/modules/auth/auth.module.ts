import { Module } from '@nestjs/common';

import { Body, Controller, Post, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { getDb, schema } from '../../db/client';
import { eq } from 'drizzle-orm';
import { parse } from '../../common/zod';
import { nowISO } from '../../common/util';
import { issueSignupCoupons } from '../coupons/coupon-engine';

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(2),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

@Controller('auth')
export class AuthController {
  constructor(private jwt: JwtService) {}

  @Post('signup')
  signup(@Body() body: unknown) {
    const dto = parse(signupSchema, body);
    const db = getDb();
    const exists = db.select().from(schema.users).where(eq(schema.users.email, dto.email)).get();
    if (exists) throw new ConflictException('이미 가입된 이메일입니다');
    const hash = bcrypt.hashSync(dto.password, 10);
    const u = db.insert(schema.users).values({
      email: dto.email, passwordHash: hash, name: dto.name, role: 'USER',
      grade: 'BRONZE', totalSpent: 0, pointBalance: 0, createdAt: nowISO(),
    }).returning({ id: schema.users.id, email: schema.users.email, name: schema.users.name, role: schema.users.role }).get();
    // 가입 축하 쿠폰 자동 발급
    issueSignupCoupons(u.id);
    const token = this.jwt.sign({ sub: u.id, email: u.email, role: u.role });
    return { token, user: u };
  }

  @Post('login')
  login(@Body() body: unknown) {
    const dto = parse(loginSchema, body);
    const db = getDb();
    const u = db.select().from(schema.users).where(eq(schema.users.email, dto.email)).get();
    if (!u) throw new UnauthorizedException('이메일 또는 비밀번호 오류');
    if (!bcrypt.compareSync(dto.password, u.passwordHash)) {
      throw new UnauthorizedException('이메일 또는 비밀번호 오류');
    }
    const token = this.jwt.sign({ sub: u.id, email: u.email, role: u.role });
    return {
      token,
      user: { id: u.id, email: u.email, name: u.name, role: u.role, grade: u.grade, pointBalance: u.pointBalance },
    };
  }
}

@Module({ controllers: [AuthController] })
export class AuthModule {}
