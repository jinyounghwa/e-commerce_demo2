import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { migrate } from './db/migrate';

async function bootstrap() {
  // 시작 시 스키마 보장 (DB가 없으면 생성)
  migrate();

  const app = await NestFactory.create(AppModule, { cors: true });
  app.setGlobalPrefix('api');
  app.enableShutdownHooks();

  const port = process.env.PORT || 3000;
  await app.listen(port);
  new Logger('Bootstrap').log(`🚀 MallDemo API on http://localhost:${port}/api`);
}
bootstrap();
