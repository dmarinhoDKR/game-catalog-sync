import {
    CanActivate,
    ExecutionContext,
    Injectable,
    UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';

export interface AuthenticatedRequest extends Request {
  auth?: {
    userId: string;
    role: 'USER' | 'ADMIN';
  };
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp()
      .getRequest<AuthenticatedRequest>();

    const authorization = request.headers.authorization;
    const match = authorization?.match(/^Bearer ([^\s]+)$/i);

    if (!match) {
      throw new UnauthorizedException('Invalid or missing token');
    }

    let claims: Record<string, unknown>;

    try {
      claims = await this.jwt.verifyAsync<Record<string, unknown>>(match[1]);
    } catch {
      throw new UnauthorizedException('Invalid or missing token');
    }

    if (
      typeof claims !== 'object' ||
      claims === null ||
      typeof claims.sub !== 'string' ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
        .test(claims.sub) ||
      (claims.role !== 'USER' && claims.role !== 'ADMIN') ||
      typeof claims.exp !== 'number' ||
      !Number.isSafeInteger(claims.exp)
    ) {
      throw new UnauthorizedException('Invalid or missing token');
    }

    request.auth = {
      userId: claims.sub,
      role: claims.role,
    };

    return true;
  }
}
