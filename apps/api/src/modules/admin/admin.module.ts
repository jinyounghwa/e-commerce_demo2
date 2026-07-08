import { Module } from '@nestjs/common';
import { DashboardController } from './admin-dashboard.controller';
import { AdminCatalogController } from './admin-catalog.controller';
import { AdminOpsController } from './admin-ops.controller';

@Module({
  controllers: [DashboardController, AdminCatalogController, AdminOpsController],
})
export class AdminModule {}
