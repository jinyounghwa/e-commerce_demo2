// JWT 인증 가드 + 현재 사용자 데코레이터
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  SetMetadata,
  applyDecorators,
  UseGuards,
  createParamDecorator,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { getDb } from '../db/client';
import { eq } from 'drizzle-orm';
import { users } from '../db/schema';

export interface JwtPayload {
  sub: number;
  email: string;
  role: 'USER' | 'ADMIN';
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private jwt: JwtService, private reflector: Reflector) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const auth = req.headers['authorization'] as string | undefined;
    if (!auth?.startsWith('Bearer ')) throw new UnauthorizedException('토큰 필요');
    const token = auth.slice(7);
    let payload: JwtPayload;
    try {
      payload = this.jwt.verify(token);
    } catch {
      throw new UnauthorizedException('유효하지 않은 토큰');
    }
    const db = getDb();
    const u = db.select().from(users).where(eq(users.id, payload.sub)).get();
    if (!u) throw new UnauthorizedException('사용자 없음');
    req.user = u;
    const roles = this.reflector.get<string[]>('roles', ctx.getHandler());
    if (roles && !roles.includes(u.role)) {
      throw new ForbiddenException('권한 없음');
    }
    return true;
  }
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest().user,
);

export function Auth(...roles: ('USER' | 'ADMIN')[]) {
  return applyDecorators(SetMetadata('roles', roles), UseGuards(AuthGuard));
}
