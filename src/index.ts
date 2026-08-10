import dotenv from 'dotenv';
dotenv.config();

import { telegramService } from './services/telegram';
import { scannerService } from './services/scanner';

function main() {
  console.log('==================================================');
  console.log('🚀 GMGN Volume Tracker Bot Starting...');
  console.log('==================================================');

  // Launch Telegram Bot
  telegramService.launch();

  // Parse poll interval from ENV (default 5000ms)
  const pollIntervalMs = parseInt(process.env.POLL_INTERVAL_MS || '5000', 10);

  // Start Scanner loop
  scannerService.start(pollIntervalMs);

  // Graceful shutdown handling
  const shutdown = (signal: string) => {
    console.log(`\n[Shutdown] Received ${signal}. Shutting down gracefully...`);
    scannerService.stop();
    telegramService.stop(signal);
    process.exit(0);
  };

  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}

main();
