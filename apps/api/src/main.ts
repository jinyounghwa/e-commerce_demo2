import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from '@nestjs/common';
import { join } from 'path';
import { existsSync } from 'fs';
import { AppModule } from './app.module';
import { migrate } from './db/migrate';
import { seedIfEmpty } from './db/seed';

async function bootstrap() {
  // 시작 시 스키마 보장 (DB가 없으면 생성)
  migrate();
  // 클라우드 휘발성 파일시스템 대응: 빈 DB면 자동 시드
  await seedIfEmpty();

  const app = await NestFactory.create<NestExpressApplication>(AppModule, { cors: true });
  app.setGlobalPrefix('api');
  app.enableShutdownHooks();

  // 정적 프론트엔드 서빙 (빌드 산물이 있을 때만 — 단일 배포 지원)
  // apps/api/dist/main.js 기준 → ../../web/dist
  const webDist = join(__dirname, '..', '..', 'web', 'dist');
  if (existsSync(webDist)) {
    app.useStaticAssets(webDist);
    // SPA fallback: /api 가 아닌 모든 라우트 → index.html
    app.use((req: any, res: any, next: any) => {
      if (req.method === 'GET' && !req.path.startsWith('/api') && !req.path.includes('.')) {
        res.sendFile(join(webDist, 'index.html'));
      } else {
        next();
      }
    });
    new Logger('Bootstrap').log(`📦 프론트엔드 정적 서빙: ${webDist}`);
  }

  const port = process.env.PORT || 3000;
  await app.listen(port);
  new Logger('Bootstrap').log(`🚀 MallDemo on http://localhost:${port} (API: /api)`);
}
bootstrap();
