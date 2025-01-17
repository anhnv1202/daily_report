import { APP_LOCALES, Locales } from '@common/constants/global.const';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { json, urlencoded } from 'express';
import helmet from 'helmet';
import * as i18n from 'i18n';
import * as path from 'path';
import { AppModule } from './app.module';
import LogService from './config/log.service';
import { setLocal } from './middlewares/locales.middleware';
import { TrimPipe } from './pipes/trim.pipe';

const PORT = process.env.APP_PORT || 3001;
const BASE_PATH = '/api';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['error', 'warn'],
  });

  app.set('trust proxy', 'loopback');
  app.setGlobalPrefix(BASE_PATH);

  i18n.configure({
    locales: APP_LOCALES,
    defaultLocale: Locales.EN,
    objectNotation: true,
    directory: path.join(__dirname, '/assets/lang'),
  });
  app.use(i18n.init);
  app.use(setLocal);
  app.use(json({ limit: process.env.LIMIT_REQUEST_BODY }));
  app.use(
    urlencoded({
      extended: true,
      limit: process.env.LIMIT_REQUEST_BODY,
    }),
  );

  app.enableCors({});
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  app.use(helmet({ crossOriginResourcePolicy: false }));
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );
  app.useGlobalPipes(new TrimPipe());
  await app.listen(PORT, () => {
    LogService.logInfo(`App is running with port ${PORT}`);
  });
}

bootstrap();
