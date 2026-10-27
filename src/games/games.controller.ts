import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiParam, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { GameLimitPipe } from './game-limit.pipe.js';
import { GamesService } from './games.service.js';
import type { Game } from '../generated/prisma/client.js';

@Controller('games')
export class GamesController {
    constructor(private readonly gamesService: GamesService) {}

    @ApiQuery({
      name: 'limit',
      required: false,
      description: 'Maximum number of games returned.',
      schema: {
        type: 'integer',
        minimum: 1,
        maximum: 100,
        default: 20,
      },
    })
    @ApiQuery({
      name: 'cursor',
      required: false,
      description: 'Returns games whose IDs are greater than this cursor.',
      schema: {
        type: 'string',
        format: 'uuid',
      },
    })
    @ApiResponse({
      status: 200,
      description:
        'Returns games ordered by ID ascending. ' +
        'nextCursor is null when there are no more games.',
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['items', 'nextCursor'],
        properties: {
          items: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: [
                'id',
                'title',
                'description',
                'genres',
                'updatedAt',
              ],
              properties: {
                id: { type: 'string', format: 'uuid' },
                title: { type: 'string' },
                description: { type: 'string' },
                genres: {
                  type: 'array',
                  items: { type: 'string' },
                },
                updatedAt: {
                  type: 'string',
                  format: 'date-time',
                },
              },
            },
          },
          nextCursor: {
            type: 'string',
            format: 'uuid',
            nullable: true,
          },
        },
      },
    })
    @ApiResponse({
      status: 400,
      description: 'Invalid pagination limit or cursor UUID.',
    })
    @ApiResponse({
      status: 503,
      description: 'Database unavailable.',
    })
    @Get()
    findPage(
        @Query('limit', GameLimitPipe) limit: number,
        @Query('cursor', new ParseUUIDPipe({ optional: true }))
        cursor?: string,
    ): Promise<{ items: Game[]; nextCursor: string | null }> {
        return this.gamesService.findPage(limit, cursor);
    }

    @ApiParam({
      name: 'id',
      required: true,
      type: String,
      format: 'uuid',
      description: 'Game ID.',
    })
    @ApiResponse({
      status: 200,
      description: 'Returns the requested game.',
      schema: {
        type: 'object',
        additionalProperties: false,
        required: [
          'id',
          'title',
          'description',
          'genres',
          'updatedAt',
        ],
        properties: {
          id: { type: 'string', format: 'uuid' },
          title: { type: 'string' },
          description: { type: 'string' },
          genres: {
            type: 'array',
            items: { type: 'string' },
          },
          updatedAt: {
            type: 'string',
            format: 'date-time',
          },
        },
      },
    })
    @ApiResponse({
      status: 400,
      description: 'Invalid game UUID.',
    })
    @ApiResponse({
      status: 404,
      description: 'Game not found.',
    })
    @ApiResponse({
      status: 503,
      description: 'Database unavailable.',
    })
    @Get(':id')
    findById(
        @Param('id', new ParseUUIDPipe()) id: string,
    ): Promise<Game> {
        return this.gamesService.findById(id);
    }
}
