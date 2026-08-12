import dotenv from 'dotenv';
dotenv.config();

import { telegramService } from './services/telegram';
import { scannerService } from './services/scanner';
import { Logger } from './utils/logger';

function main() {
  Logger.info('System', '==================================================');
  Logger.info('System', '🚀 GMGN Volume Tracker Bot Starting...');
  Logger.info('System', '==================================================');

  // Launch Telegram Bot
  telegramService.launch();

  // Start Scanner loop using config state (default 20 seconds)
  scannerService.start();

  // Graceful shutdown handling
  const shutdown = (signal: string) => {
    Logger.info('System', `Received ${signal}. Shutting down gracefully...`);
    scannerService.stop();
    telegramService.stop(signal);
    process.exit(0);
  };

  // Global Exception & Rejection Handlers
  process.on('uncaughtException', (err) => {
    Logger.error('System', `Uncaught Exception: ${err?.message || err}`);
  });

  process.on('unhandledRejection', (reason: any) => {
    Logger.error('System', `Unhandled Rejection: ${reason?.message || reason}`);
  });

  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}

main();
