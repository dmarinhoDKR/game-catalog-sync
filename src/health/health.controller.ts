import {
    Controller,
    Get,
    ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Controller('health')
export class HealthController {
    constructor(private readonly prismaService: PrismaService) {}

    @Get('live')
    getLiveness(): { status: string } {
        return { status: 'ok' };
    }

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
