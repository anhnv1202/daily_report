import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { TelegramService } from '../telegram/telegram.service';

@Injectable()
export class CronJobService {
  constructor(private telegramService: TelegramService) {}

  @Cron('0 0 17 * * 1-5')
  // @Cron('* */1 * * * *')
  async sendMorningReminder() {
    await this.telegramService.sendDailyReminder();
  }
}
