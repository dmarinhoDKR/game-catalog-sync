import {
    Controller,
    Get,
    ServiceUnavailableException,
} from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service.js';

@Controller('health')
export class HealthController {
    constructor(private readonly prismaService: PrismaService) {}

    @ApiResponse({
      status: 200,
      description: 'Application is running. Does not check database connectivity.',
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['status'],
        properties: {
          status: { type: 'string', enum: ['ok'] },
        },
      },
    })
    @Get('live')
    getLiveness(): { status: string } {
        return { status: 'ok' };
    }

    @ApiResponse({
      status: 200,
      description: 'Application can query the database.',
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['status'],
        properties: {
          status: { type: 'string', enum: ['ok'] },
        },
      },
    })
    @ApiResponse({
      status: 503,
      description: 'Database unavailable.',
    })
    @Get('ready')
    async getReadiness(): Promise<{ status: string }> {
        try {
            await this.prismaService.$queryRaw`SELECT 1`;
        } catch {
            throw new ServiceUnavailableException('Database unavailable');
        }

        return { status: 'ok' };
    }
}
