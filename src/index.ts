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

  // Parse poll interval from ENV (default 20000ms / 20s)
  const pollIntervalMs = parseInt(process.env.POLL_INTERVAL_MS || '20000', 10);

  // Start Scanner loop
  scannerService.start(pollIntervalMs);

  // Graceful shutdown handling
  const shutdown = (signal: string) => {
    Logger.info('System', `Received ${signal}. Shutting down gracefully...`);
    scannerService.stop();
    telegramService.stop(signal);
    process.exit(0);
  };

  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}

main();
