/**
 * Nest middleware: extract Bearer token, verify (HS256 or ES256), attach
 * `req.user = { id }`. Controllers read `req.user.id`; the DbService stamps
 * it into the TX-local `request.jwt.claim.sub` so RLS works.
 *
 * Algorithm dispatch is automatic from the token header; callers don't care.
 */
import { Injectable, Logger, NestMiddleware, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response, NextFunction } from 'express';
import { verifyJwtAsync } from './jwt';
import { JwksService } from './jwks.service';
import { UserSyncService } from './user-sync.service';

declare module 'express-serve-static-core' {
  interface Request {
    user?: { id: string; email?: string };
  }
}

@Injectable()
export class JwtMiddleware implements NestMiddleware {
  private readonly log = new Logger(JwtMiddleware.name);
  private readonly hsSecret: string | undefined;
  constructor(
    cfg: ConfigService,
    private readonly jwks: JwksService,
    private readonly userSync: UserSyncService,
  ) {
    this.hsSecret = cfg.get<string>('SUPABASE_JWT_SECRET') || undefined;
    if (!this.hsSecret) {
      this.log.warn('SUPABASE_JWT_SECRET not set; HS256 verification disabled');
    }
  }

  async use(req: Request, _res: Response, next: NextFunction) {
    const auth = req.header('authorization');
    if (!auth?.startsWith('Bearer ')) throw new UnauthorizedException();
    const tok = auth.slice('Bearer '.length).trim();
    try {
      const claims = await verifyJwtAsync(tok, {
        ...(this.hsSecret && { hsSecret: this.hsSecret }),
        keyResolver: this.jwks.resolve,
      });
      req.user = { id: claims.sub, ...(claims.email && { email: claims.email }) };
      // First-request bootstrap: make sure the user has an app_user row before
      // any controller tries to insert a child (broker/holding/watchlist/…).
      // Cached in-memory after the first call; ~zero cost on the hot path.
      await this.userSync.ensure(claims.sub);
      next();
    } catch (e) {
      // Visible at INFO level so 401s are easy to diagnose during dev.
      this.log.warn(`jwt rejected: ${(e as Error).message} (token prefix: ${tok.slice(0, 20)}…)`);
      throw new UnauthorizedException((e as Error).message);
    }
  }
}
