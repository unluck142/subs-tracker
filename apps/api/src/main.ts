import 'dotenv/config';
import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { HttpAdapterHost, NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { BotService } from './bot/bot.service';
import { AlertingFilter } from './common/alerting.filter';
import { loadConfig } from './config';

async function bootstrap() {
  const config = loadConfig();
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new AlertingFilter(app.get(BotService), app.get(HttpAdapterHost).httpAdapter));
  app.enableShutdownHooks();
  // В production API доступен только локально: снаружи к нему ходит Next.js через /api/*
  if (config.isProduction) {
    await app.listen(config.port, '127.0.0.1');
  } else {
    await app.listen(config.port);
  }

  const logger = new Logger('Bootstrap');
  logger.log(`API запущен: http://localhost:${config.port}/api`);
  if (config.devTelegramId) {
    logger.warn(`Режим разработки: запросы без Telegram идут от пользователя ${config.devTelegramId}`);
  }
}

void bootstrap();
