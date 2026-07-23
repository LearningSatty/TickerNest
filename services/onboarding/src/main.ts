import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = process.env['PORT'] || 3004;
  app.enableCors({
    origin: process.env['WEB_ORIGIN'] || '*',
    credentials: true,
  });
  await app.listen(port);
  Logger.log(`tickernest-onboarding (Portfolio Onboarding) listening on :${port}`, 'Bootstrap');
}
bootstrap();
