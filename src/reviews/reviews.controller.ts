import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Put,
  Req,
  UnauthorizedException,
  UseGuards,
  Delete,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiParam,
  ApiResponse,
} from '@nestjs/swagger';
import type { Review } from '../generated/prisma/client.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { AuthenticatedRequest } from '../auth/jwt-auth.guard.js';
import { ReviewBodyPipe } from './review-body.pipe.js';
import type { ReviewInput } from './review-body.pipe.js';
import { ReviewsService } from './reviews.service.js';

@ApiBearerAuth()
@Controller('games')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @ApiParam({
    name: 'id',
    required: true,
    type: String,
    format: 'uuid',
    description: 'Game ID.',
  })
  @ApiBody({
    required: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['rating', 'body'],
      properties: {
        rating: {
          type: 'integer',
          minimum: 1,
          maximum: 5,
          example: 4,
        },
        body: {
          type: 'string',
          description:
            'Leading/trailing whitespace is removed. ' +
            'The trimmed text must contain 1-2000 UTF-16 code units.',
          example: 'A synthetic review for demonstration.',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Creates or updates the review belonging to the authenticated user.',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: [
        'id',
        'userId',
        'gameId',
        'rating',
        'body',
        'createdAt',
        'updatedAt',
      ],
      properties: {
        id: { type: 'string', format: 'uuid' },
        userId: { type: 'string', format: 'uuid' },
        gameId: { type: 'string', format: 'uuid' },
        rating: { type: 'integer', minimum: 1, maximum: 5 },
        body: { type: 'string' },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid game UUID or review input.',
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid or missing token, or user no longer exists.',
  })
  @ApiResponse({
    status: 404,
    description: 'Game not found.',
  })
  @ApiResponse({
    status: 409,
    description:
      'User or game no longer available, or concurrent review conflict.',
  })
  @ApiResponse({
    status: 503,
    description: 'Database unavailable.',
  })
  @Put(':id/review')
  @UseGuards(JwtAuthGuard)
  save(
    @Param('id', new ParseUUIDPipe()) gameId: string,
    @Body(ReviewBodyPipe) input: ReviewInput,
    @Req() request: AuthenticatedRequest,
  ): Promise<Review> {
    if (!request.auth) {
      throw new UnauthorizedException('Invalid or missing token');
    }

    return this.reviewsService.save(
      request.auth.userId,
      gameId,
      input,
    );
  }

  @ApiParam({
    name: 'id',
    required: true,
    type: String,
    format: 'uuid',
    description: 'Game ID.',
  })
  @ApiResponse({
    status: 204,
    description:
      'Removes the review belonging to the authenticated user. Returns no body. ' +
      'Repeated deletion and an absent game or review also return 204.',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid game UUID.',
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid or missing token, or user no longer exists.',
  })
  @ApiResponse({
    status: 503,
    description: 'Database unavailable.',
  })
  @Delete(':id/review')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  remove(
    @Param('id', new ParseUUIDPipe()) gameId: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<void> {
    if (!request.auth) {
      throw new UnauthorizedException('Invalid or missing token');
    }

    return this.reviewsService.remove(
      request.auth.userId,
      gameId,
    );
  }
}
