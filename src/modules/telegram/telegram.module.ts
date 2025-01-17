import { DailyReport, DailyReportSchema } from '@models/daily-report.model';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TelegramController } from './telegram.controller';
import { TelegramRepository } from './telegram.repository';
import { TelegramService } from './telegram.service';
@Module({
  imports: [MongooseModule.forFeature([{ name: DailyReport.name, schema: DailyReportSchema }])],
  controllers: [TelegramController],
  providers: [TelegramService, TelegramRepository],
  exports: [TelegramService],
})
export class TelegramModule {}
