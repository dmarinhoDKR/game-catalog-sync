import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AuthenticatedRequest } from './jwt-auth.guard.js';

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp()
      .getRequest<AuthenticatedRequest>();

    const identity = request.auth;

    if (!identity) {
      throw new UnauthorizedException('Invalid or missing token');
    }

    let user: { role: 'USER' | 'ADMIN' } | null;

    try {
      user = await this.prisma.user.findUnique({
        where: { id: identity.userId },
        select: { role: true },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        const adapterError = error.meta?.driverAdapterError;

        const cause =
          typeof adapterError === 'object' &&
          adapterError !== null &&
          'cause' in adapterError
            ? adapterError.cause
            : undefined;

        const isAdminShutdown =
          error.code === 'P2039' &&
          typeof cause === 'object' &&
          cause !== null &&
          'originalCode' in cause &&
          cause.originalCode === '57P01';

        if (error.code === 'P1001' || isAdminShutdown) {
          throw new ServiceUnavailableException('Database unavailable');
        }
      }

      throw error;
    }

    if (!user) {
      throw new UnauthorizedException('Invalid or missing token');
    }

    if (user.role !== 'ADMIN') {
      throw new ForbiddenException('Administrator access required');
    }

    request.auth = {
      userId: identity.userId,
      role: user.role,
    };

    return true;
  }
}
