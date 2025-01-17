import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class DailyReport extends Document {
  @Prop({ required: true })
  username: string;

  @Prop({ required: true })
  date: Date;

  @Prop({ type: Object })
  report: {
    yesterday: string[];
    today: string[];
    blockers: string[];
  };

  @Prop()
  rawText: string;
}

export const DailyReportSchema = SchemaFactory.createForClass(DailyReport);
DailyReportSchema.statics = {};
