import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { CatalogImportService } from './catalog-import.service.js';

@Module({
  imports: [PrismaModule],
  providers: [CatalogImportService],
  exports: [CatalogImportService],
})
export class SyncModule {}
