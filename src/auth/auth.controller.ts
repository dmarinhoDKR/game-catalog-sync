import {
    Body,
    Controller,
    Header,
    HttpCode,
    HttpStatus,
    Post,
    UseGuards,
} from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { AuthService } from './auth.service.js';
import { LoginBodyPipe } from './login-body.pipe.js';
import type { LoginInput } from './login-body.pipe.js';

@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) {}

    @Post('login')
    @HttpCode(HttpStatus.OK)
    @Header('Cache-Control', 'no-store')
    @UseGuards(ThrottlerGuard)
    signIn(
      @Body(LoginBodyPipe) input: LoginInput,
    ): Promise<{ access_token: string }> {
      return this.authService.signIn(input);
    }
}
