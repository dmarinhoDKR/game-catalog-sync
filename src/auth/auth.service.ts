import {
  HttpException,
  HttpStatus,
  Injectable,
  OnModuleInit,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { LoginInput } from './login-body.pipe.js';
import { normalizeEmail } from './normalize-email.js';
import { hashPassword, verifyPassword } from './password-hash.js';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthService implements OnModuleInit {
  private dummyHash = '';
  private verifying = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.dummyHash = await hashPassword(randomUUID());
  }

  async signIn(input: LoginInput): Promise<{ access_token: string }> {
    const user = await this.authenticate(input);

    return {
      access_token: await this.jwt.signAsync({
        sub: user.id,
        role: user.role,
      }),
    };
  }

  async authenticate(input: LoginInput) {
    if (!this.dummyHash) {
      throw new ServiceUnavailableException('Authentication unavailable');
    }

    if (this.verifying) {
      throw new HttpException(
        'Authentication busy; try again later',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    this.verifying = true;

    try {
      const user = await this.prisma.user.findUnique({
        where: { email: normalizeEmail(input.email) },
        select: {
          id: true,
          email: true,
          role: true,
          passwordHash: true,
        },
      });

      const valid = await verifyPassword(
        input.password,
        user?.passwordHash ?? this.dummyHash,
      );

      if (!user || !valid) {
        throw new UnauthorizedException('Invalid credentials');
      }

      return {
        id: user.id,
        email: user.email,
        role: user.role,
      };
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
    } finally {
      this.verifying = false;
    }
  }
}
