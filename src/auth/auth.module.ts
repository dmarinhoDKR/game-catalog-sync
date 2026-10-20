import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { createJwtOptions } from './jwt-options.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';

@Module({
  imports: [
    PrismaModule,
    JwtModule.registerAsync({
      useFactory: () => createJwtOptions(process.env.JWT_SECRET),
    }),
    ThrottlerModule.forRoot([
      { ttl: 60_000, limit: 5 },
    ]),
  ],
  controllers: [AuthController],
  providers: [AuthService, ThrottlerGuard, JwtAuthGuard],
  exports: [AuthService, ThrottlerGuard, JwtAuthGuard, JwtModule],
})
export class AuthModule {}
