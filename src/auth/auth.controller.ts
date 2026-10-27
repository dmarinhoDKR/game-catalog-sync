import {
    Body,
    Controller,
    Header,
    HttpCode,
    HttpStatus,
    Post,
    UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { AuthService } from './auth.service.js';
import { LoginBodyPipe } from './login-body.pipe.js';
import type { LoginInput } from './login-body.pipe.js';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) {}

    @ApiOperation({
      summary: 'Authenticate a demonstration user',
      description:
        'Normalizes email and preserves the exact password. ' +
        'Limited to five requests per minute per IP and one credential ' +
        'verification at a time per service instance.',
    })
    @ApiBody({
      required: true,
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['email', 'password'],
        properties: {
          email: {
            type: 'string',
            description:
              'Leading/trailing whitespace is removed and email is lowercased. ' +
              'The normalized email must pass basic format validation and be at most 254 characters.',
            example: 'user@example.test',
          },
          password: {
            type: 'string',
            format: 'password',
            minLength: 1,
            description:
              'Exact password, without trimming or normalization; at most 1024 UTF-8 bytes.',
          },
        },
      },
    })
    @ApiResponse({
      status: 200,
      description: 'JWT access token valid for 900 seconds. Response is not cached.',
      headers: {
        'Cache-Control': {
          schema: { type: 'string', example: 'no-store' },
        },
      },
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['access_token'],
        properties: {
          access_token: { type: 'string' },
        },
      },
    })
    @ApiResponse({ status: 400, description: 'Invalid login input.' })
    @ApiResponse({ status: 401, description: 'Invalid credentials.' })
    @ApiResponse({
      status: 429,
      description: 'Request rate exceeded or credential verification is busy.',
    })
    @ApiResponse({
      status: 503,
      description: 'Database or authentication service unavailable.',
    })
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
