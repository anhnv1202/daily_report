import { DailyReport } from '@models/daily-report.model';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseRepository } from 'src/base/base.repository';

@Injectable()
export class TelegramRepository extends BaseRepository<DailyReport> {
  constructor(@InjectModel(DailyReport.name) userModel: Model<DailyReport>) {
    super(userModel);
  }
}
