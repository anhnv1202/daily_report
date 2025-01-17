import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { format } from 'date-fns';
import * as ExcelJS from 'exceljs';
import * as TelegramBot from 'node-telegram-bot-api';
import { TelegramRepository } from './telegram.repository';

@Injectable()
export class TelegramService {
  private bot: TelegramBot;
  private readonly logger = new Logger(TelegramService.name);
  private readonly groupId: string;

  private userStates = new Map<
    number,
    {
      step: 'yesterday' | 'today' | 'blockers';
      report: {
        yesterday: string[];
        today: string[];
        blockers: string[];
      };
    }
  >();

  constructor(
    private telegramRepository: TelegramRepository,
    private configService: ConfigService,
  ) {
    this.bot = new TelegramBot(this.configService.get('TELEGRAM_BOT_TOKEN'), { polling: true });
    this.groupId = this.configService.get('TELEGRAM_GROUP_ID');
    this.initializeBot();
  }

  private initializeBot() {
    // Handle daily report submissions
    this.bot.onText(/\/daily/, async (msg) => {
      await this.startDailyReport(msg.chat.id, msg.from.username);
    });

    // Handle callback queries for the form
    this.bot.on('callback_query', async (query) => {
      if (query.data.startsWith('daily_report_')) {
        await this.handleDailyReportForm(query);
      }
    });

    // Handle text responses for the form
    this.bot.on('message', async (msg) => {
      if (msg.reply_to_message && this.isAwaitingResponse(msg.from.id)) {
        await this.handleFormResponse(msg);
      }
    });

    // Handle export command
    this.bot.onText(/\/export (.+)/, async (msg, match) => {
      const [month, year] = match[1].split('/');
      await this.handleExport(msg.chat.id, parseInt(month), parseInt(year));
    });
  }

  async sendDailyReminder() {
    const reminderMessage = `🔔 *Daily Report Reminder*

Please submit your daily report using the /daily command.

Format:
1. Yesterday's tasks
2. Today's tasks
3. Any blockers?

Your report helps the team stay aligned and informed!`;

    await this.bot.sendMessage(this.groupId, reminderMessage, {
      parse_mode: 'Markdown',
    });
  }

  private async startDailyReport(chatId: number, username: string) {
    const message = `📝 *Daily Report for @${username}*\nLet's fill out your daily report step by step.`;

    await this.bot.sendMessage(chatId, message, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[{ text: 'Start Report', callback_data: 'daily_report_start' }]],
      },
    });
  }

  private async handleDailyReportForm(query: TelegramBot.CallbackQuery) {
    const chatId = query.message.chat.id;
    const userId = query.from.id;

    if (query.data === 'daily_report_start') {
      this.userStates.set(userId, {
        step: 'yesterday',
        report: { yesterday: [], today: [], blockers: [] },
      });

      await this.bot.sendMessage(chatId, "What did you accomplish yesterday? (List items with '-' prefix)", {
        reply_markup: { force_reply: true },
      });
    }
  }

  private async handleFormResponse(msg: TelegramBot.Message) {
    const userId = msg.from.id;
    const chatId = msg.chat.id;
    const userState = this.userStates.get(userId);

    if (!userState) return;

    const items = msg.text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('-'))
      .map((line) => line.substring(1).trim());

    switch (userState.step) {
      case 'yesterday':
        userState.report.yesterday = items;
        userState.step = 'today';
        await this.bot.sendMessage(chatId, "What are you working on today? (List items with '-' prefix)", {
          reply_markup: { force_reply: true },
        });
        break;
      case 'today':
        userState.report.today = items;
        userState.step = 'blockers';
        await this.bot.sendMessage(chatId, "Any blockers? (List items with '-' prefix, or send '-' if none)", {
          reply_markup: { force_reply: true },
        });
        break;
      case 'blockers':
        userState.report.blockers = items;
        await this.submitReport(msg, userState.report);
        this.userStates.delete(userId);
        break;
    }
  }

  private async submitReport(msg: TelegramBot.Message, report: any) {
    const username = msg.from.username;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    try {
      // Check for existing report today
      const existingReport = await this.telegramRepository.findOne({
        username,
        date: {
          $gte: today,
          $lt: new Date(today.getTime() + 24 * 60 * 60 * 1000),
        },
      });

      if (existingReport) {
        // Update existing report
        await this.telegramRepository.update(existingReport._id, {
          report,
          rawText: msg.text,
          updatedAt: new Date(),
        });
        await this.bot.sendMessage(msg.chat.id, '✅ Your daily report has been updated!');
      } else {
        // Create new report
        await this.telegramRepository.create({
          username,
          date: new Date(),
          report,
          rawText: msg.text,
        });
        await this.bot.sendMessage(msg.chat.id, '✅ Your daily report has been submitted!');
      }

      // Send formatted report to group
      const formattedReport = this.formatReport(username, report);
      await this.bot.sendMessage(this.groupId, formattedReport, {
        parse_mode: 'Markdown',
      });
    } catch (error) {
      this.logger.error('Error handling daily report:', error);
      await this.bot.sendMessage(msg.chat.id, '❌ Error saving your report. Please try again.');
    }
  }

  private isAwaitingResponse(userId: number): boolean {
    return this.userStates.has(userId);
  }

  private formatReport(username: string, report: any): string {
    return `*Daily Report from @${username}*

*Yesterday:*
${report.yesterday.map((item) => `- ${item}`).join('\n')}

*Today:*
${report.today.map((item) => `- ${item}`).join('\n')}

*Blockers:*
${report.blockers.map((item) => `- ${item}`).join('\n')}`;
  }

  private async handleExport(chatId: number, month: number, year: number) {
    try {
      const buffer = await this.exportMonthlyReport(month, year);
      await this.bot.sendDocument(
        chatId,
        buffer as Buffer,
        { caption: `📊 Daily Reports for ${format(new Date(year, month - 1), 'MMMM yyyy')}` },
        {
          filename: `daily-reports-${month}-${year}.xlsx`,
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        },
      );
    } catch (error) {
      this.logger.error('Error exporting report:', error);
      await this.bot.sendMessage(chatId, '❌ Error generating report. Please try again.');
    }
  }

  private async exportMonthlyReport(month: number, year: number) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Daily Report Bot';
    workbook.created = new Date();

    const users = await this.telegramRepository.distinct('username', {
      date: {
        $gte: new Date(year, month - 1, 1),
        $lt: new Date(year, month, 1),
      },
    });

    // Create individual sheets for each user
    for (const username of users) {
      await this.createUserSheet(workbook, username, month, year);
    }

    // Create summary sheet
    await this.createSummarySheet(workbook, users, month, year);

    return await workbook.xlsx.writeBuffer();
  }

  private async createUserSheet(workbook: ExcelJS.Workbook, username: string, month: number, year: number) {
    const worksheet = workbook.addWorksheet(username);

    worksheet.columns = [
      { header: 'Date', key: 'date', width: 15 },
      { header: 'Yesterday', key: 'yesterday', width: 40 },
      { header: 'Today', key: 'today', width: 40 },
      { header: 'Blockers', key: 'blockers', width: 30 },
    ];

    const reports = await this.telegramRepository.findAll(
      {
        username,
        date: {
          $gte: new Date(year, month - 1, 1),
          $lt: new Date(year, month, 1),
        },
      },
      null,
      { date: 1 },
    );

    reports.forEach((report) => {
      worksheet.addRow({
        date: format(report.date, 'dd/MM/yyyy'),
        yesterday: report.report.yesterday.join('\n'),
        today: report.report.today.join('\n'),
        blockers: report.report.blockers.join('\n'),
      });
    });

    this.styleWorksheet(worksheet);
  }

  private async createSummarySheet(workbook: ExcelJS.Workbook, users: string[], month: number, year: number) {
    const summary = workbook.addWorksheet('Summary');

    summary.columns = [
      { header: 'Username', key: 'username', width: 15 },
      { header: 'Reports Submitted', key: 'submitted', width: 20 },
      { header: 'Days in Month', key: 'totalDays', width: 15 },
      { header: 'Completion Rate', key: 'rate', width: 20 },
    ];

    const daysInMonth = new Date(year, month, 0).getDate();

    for (const username of users) {
      const reportCount = await this.telegramRepository.countDocuments({
        username,
        date: {
          $gte: new Date(year, month - 1, 1),
          $lt: new Date(year, month, 1),
        },
      });

      summary.addRow({
        username,
        submitted: reportCount,
        totalDays: daysInMonth,
        rate: `${((reportCount / daysInMonth) * 100).toFixed(1)}%`,
      });
    }

    this.styleWorksheet(summary);
  }

  private styleWorksheet(worksheet: ExcelJS.Worksheet) {
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

    worksheet.columns.forEach((column) => {
      column.alignment = { wrapText: true, vertical: 'top' };
    });
  }
}
