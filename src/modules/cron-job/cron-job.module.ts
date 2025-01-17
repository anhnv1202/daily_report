import { TelegramModule } from '@modules/telegram/telegram.module';
import { Module } from '@nestjs/common';
import { CronJobService } from './cron-job.service';

@Module({
  imports: [TelegramModule],
  providers: [CronJobService],
  exports: [CronJobService],
})
export class CronJobModule {}
