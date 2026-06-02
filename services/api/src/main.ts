import 'reflect-metadata';
// Node <18.14 is missing Headers.prototype.getSetCookie which yahoo-finance2
// needs when using the native Fetch API. Polyfill it so the cookie crumb
// handshake succeeds on Node 18.12.x.  Remove once Node ≥20 is in use.
if (typeof Headers !== 'undefined' && !('getSetCookie' in Headers.prototype)) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (Headers.prototype as any)['getSetCookie'] = function (): string[] {
    // Headers is a class with a private internal multi-map; iterate entries
    // to find all Set-Cookie values (there is usually one).
    const cookies: string[] = [];
    (this as Headers).forEach((v: string, k: string) => {
      if (k.toLowerCase() === 'set-cookie') cookies.push(v);
    });
    return cookies;
  };
}

import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import * as express from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe());
  // Accept raw text/csv bodies (used by /watchlists/:id/import).  Express
  // bodyParser registers as text() — the resulting `req.body` is a string.
  app.use(express.text({ type: 'text/csv', limit: '1mb' }));
  app.enableCors({
    origin: process.env['WEB_ORIGIN'] ?? '*',
    credentials: true,
  });
  const port = Number(process.env['PORT'] ?? 3000);
  await app.listen(port);
  Logger.log(`TickerNest API listening on :${port}`, 'Bootstrap');
}
bootstrap();
