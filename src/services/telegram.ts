import { Telegraf, Context } from 'telegraf';
import {
  getState,
  setThreshold,
  setMaxAge,
  setMinAge,
  setCooldownMinutes,
  setPollIntervalSeconds,
  setIsActive,
  getLastScanMap,
  getActiveCooldownCount,
} from '../state';
import { SupportedChain, TokenAlert } from '../types';
import { formatTelegramAlert, formatCurrency, formatWIBDate } from '../utils/format';
import { Logger } from '../utils/logger';
import { scannerService } from './scanner';

export class TelegramService {
  private bot: Telegraf | null = null;
  private targetChatId: string | number | null = null;

  constructor() {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      Logger.warn('Telegram', 'TELEGRAM_BOT_TOKEN is not defined in environment!');
      return;
    }

    this.bot = new Telegraf(token);
    this.targetChatId = process.env.TELEGRAM_CHAT_ID || null;

    this.registerCommands();
  }

  private isAuthorized(ctx: Context): boolean {
    if (!this.targetChatId) return true; // If chat ID not restricted in env, allow
    const chatId = ctx.chat?.id?.toString();
    const fromId = ctx.from?.id?.toString();
    const target = this.targetChatId.toString();

    return chatId === target || fromId === target;
  }

  private registerCommands() {
    if (!this.bot) return;

    // Middleware authorization check
    this.bot.use(async (ctx, next) => {
      if (!this.isAuthorized(ctx)) {
        Logger.warn('TelegramAuth', `Blocked update from chatId: ${ctx.chat?.id}, fromId: ${ctx.from?.id}`);
        await ctx.reply('⛔ Access denied. Unauthorized chat or user.');
        return;
      }
      return next();
    });

    // Command: /setthreshold <chain> <amount>
    this.bot.command('setthreshold', async (ctx) => {
      const parts = ctx.message.text.trim().split(/\s+/);
      if (parts.length < 3) {
        await ctx.reply(
          '❌ *Format salah.*\nGunakan: `/setthreshold <chain> <amount>`\nContoh: `/setthreshold sol 50000`',
          { parse_mode: 'Markdown' }
        );
        return;
      }

      const chainInput = parts[1].toLowerCase() as SupportedChain;
      const amountInput = parseFloat(parts[2]);

      const validChains: SupportedChain[] = ['sol', 'bsc', 'robinhood'];
      if (!validChains.includes(chainInput)) {
        await ctx.reply(`❌ Chain tidak valid! Pilihan chain: \`sol\`, \`bsc\`, \`robinhood\``, {
          parse_mode: 'Markdown',
        });
        return;
      }

      if (isNaN(amountInput) || amountInput <= 0) {
        await ctx.reply('❌ Amount threshold harus berupa angka positif!');
        return;
      }

      setThreshold(chainInput, amountInput);
      Logger.info('TelegramCommand', `User ${ctx.from?.id} updated threshold: ${chainInput.toUpperCase()} -> $${amountInput.toLocaleString()}`);
      await ctx.reply(
        `✅ *Threshold updated!*\nChain: \`${chainInput.toUpperCase()}\`\nNew Threshold: *${formatCurrency(
          amountInput
        )}*`,
        { parse_mode: 'Markdown' }
      );
    });

    // Command: /threshold
    this.bot.command('threshold', async (ctx) => {
      Logger.info('TelegramCommand', `User ${ctx.from?.id} checked /threshold`);
      const state = getState();
      let msg = `⚙️ *Threshold Volume 1m Saat Ini:*\n\n`;
      msg += `• *SOL:* ${formatCurrency(state.threshold.sol)}\n`;
      msg += `• *BSC:* ${formatCurrency(state.threshold.bsc)}\n`;
      msg += `• *ROBINHOOD:* ${formatCurrency(state.threshold.robinhood)}\n`;
      await ctx.reply(msg, { parse_mode: 'Markdown' });
    });

    // Command: /setmaxage <chain> <duration>
    this.bot.command('setmaxage', async (ctx) => {
      const parts = ctx.message.text.trim().split(/\s+/);
      if (parts.length < 3) {
        await ctx.reply(
          '❌ *Format salah.*\nGunakan: `/setmaxage <chain> <durasi>`\nContoh: `/setmaxage sol 1h` atau `/setmaxage sol off`',
          { parse_mode: 'Markdown' }
        );
        return;
      }

      const chainInput = parts[1].toLowerCase() as SupportedChain;
      const durationInput = parts[2].toLowerCase();

      const validChains: SupportedChain[] = ['sol', 'bsc', 'robinhood'];
      if (!validChains.includes(chainInput)) {
        await ctx.reply(`❌ Chain tidak valid! Pilihan chain: \`sol\`, \`bsc\`, \`robinhood\``, {
          parse_mode: 'Markdown',
        });
        return;
      }

      if (durationInput === 'off' || durationInput === '0') {
        setMaxAge(chainInput, undefined);
        Logger.info('TelegramCommand', `User ${ctx.from?.id} disabled max age for ${chainInput.toUpperCase()}`);
        await ctx.reply(`✅ *Filter Max Age Dimatikan* untuk chain \`${chainInput.toUpperCase()}\``, {
          parse_mode: 'Markdown',
        });
        return;
      }

      if (!/^\d+[mhd]$/.test(durationInput)) {
        await ctx.reply(
          '❌ *Format durasi tidak valid!*\nGunakan kombinasi angka & satuan (`m`/`h`/`d`). Contoh: `30m`, `1h`, `6h`, `2d`, atau `off`.',
          { parse_mode: 'Markdown' }
        );
        return;
      }

      setMaxAge(chainInput, durationInput);
      Logger.info('TelegramCommand', `User ${ctx.from?.id} set max age: ${chainInput.toUpperCase()} -> ${durationInput}`);
      await ctx.reply(
        `✅ *Max Token Age updated!*\nChain: \`${chainInput.toUpperCase()}\`\nMax Age: *${durationInput}*`,
        { parse_mode: 'Markdown' }
      );
    });

    // Command: /setminage <chain> <duration>
    this.bot.command('setminage', async (ctx) => {
      const parts = ctx.message.text.trim().split(/\s+/);
      if (parts.length < 3) {
        await ctx.reply(
          '❌ *Format salah.*\nGunakan: `/setminage <chain> <durasi>`\nContoh: `/setminage sol 5m` atau `/setminage sol off`',
          { parse_mode: 'Markdown' }
        );
        return;
      }

      const chainInput = parts[1].toLowerCase() as SupportedChain;
      const durationInput = parts[2].toLowerCase();

      const validChains: SupportedChain[] = ['sol', 'bsc', 'robinhood'];
      if (!validChains.includes(chainInput)) {
        await ctx.reply(`❌ Chain tidak valid! Pilihan chain: \`sol\`, \`bsc\`, \`robinhood\``, {
          parse_mode: 'Markdown',
        });
        return;
      }

      if (durationInput === 'off' || durationInput === '0') {
        setMinAge(chainInput, undefined);
        Logger.info('TelegramCommand', `User ${ctx.from?.id} disabled min age for ${chainInput.toUpperCase()}`);
        await ctx.reply(`✅ *Filter Min Age Dimatikan* untuk chain \`${chainInput.toUpperCase()}\``, {
          parse_mode: 'Markdown',
        });
        return;
      }

      if (!/^\d+[mhd]$/.test(durationInput)) {
        await ctx.reply(
          '❌ *Format durasi tidak valid!*\nGunakan kombinasi angka & satuan (`m`/`h`/`d`). Contoh: `5m`, `10m`, `1h`, atau `off`.',
          { parse_mode: 'Markdown' }
        );
        return;
      }

      setMinAge(chainInput, durationInput);
      Logger.info('TelegramCommand', `User ${ctx.from?.id} set min age: ${chainInput.toUpperCase()} -> ${durationInput}`);
      await ctx.reply(
        `✅ *Min Token Age updated!*\nChain: \`${chainInput.toUpperCase()}\`\nMin Age: *${durationInput}*`,
        { parse_mode: 'Markdown' }
      );
    });

    // Command: /age
    this.bot.command(['age', 'maxage'], async (ctx) => {
      Logger.info('TelegramCommand', `User ${ctx.from?.id} checked /age`);
      const state = getState();
      let msg = `⏳ *Filter Umur Token (Token Age) Saat Ini:*\n\n`;
      msg += `• *SOL:* Min: ${state.ageFilter.sol.minAge || 'Off'} | Max: ${state.ageFilter.sol.maxAge || 'Off'}\n`;
      msg += `• *BSC:* Min: ${state.ageFilter.bsc.minAge || 'Off'} | Max: ${state.ageFilter.bsc.maxAge || 'Off'}\n`;
      msg += `• *ROBINHOOD:* Min: ${state.ageFilter.robinhood.minAge || 'Off'} | Max: ${state.ageFilter.robinhood.maxAge || 'Off'}\n`;
      await ctx.reply(msg, { parse_mode: 'Markdown' });
    });

    // Command: /setinterval <seconds>
    this.bot.command('setinterval', async (ctx) => {
      const parts = ctx.message.text.trim().split(/\s+/);
      if (parts.length < 2) {
        await ctx.reply('❌ *Format salah.*\nGunakan: `/setinterval <detik>`\nContoh: `/setinterval 20` atau `/setinterval 15`', {
          parse_mode: 'Markdown',
        });
        return;
      }

      const seconds = parseInt(parts[1], 10);
      if (isNaN(seconds) || seconds < 5) {
        await ctx.reply('❌ Interval polling minimal 5 detik agar mematuhi rate limit GMGN!');
        return;
      }

      setPollIntervalSeconds(seconds);
      scannerService.updateInterval(seconds);
      Logger.info('TelegramCommand', `User ${ctx.from?.id} updated poll interval -> ${seconds}s`);
      await ctx.reply(`✅ *Poll Interval Updated!*\nFrekuensi scanning: *${seconds} detik* per siklus`, {
        parse_mode: 'Markdown',
      });
    });

    // Command: /interval
    this.bot.command('interval', async (ctx) => {
      Logger.info('TelegramCommand', `User ${ctx.from?.id} checked /interval`);
      const state = getState();
      await ctx.reply(`⏱ *Poll Interval Scanner:* ${state.pollIntervalSeconds} detik per siklus`, {
        parse_mode: 'Markdown',
      });
    });

    // Command: /setcooldown <minutes>
    this.bot.command('setcooldown', async (ctx) => {
      const parts = ctx.message.text.trim().split(/\s+/);
      if (parts.length < 2) {
        await ctx.reply('❌ *Format salah.*\nGunakan: `/setcooldown <menit>`\nContoh: `/setcooldown 10`', {
          parse_mode: 'Markdown',
        });
        return;
      }

      const minutes = parseInt(parts[1], 10);
      if (isNaN(minutes) || minutes < 1) {
        await ctx.reply('❌ Cooldown harus berupa angka minimal 1 menit!');
        return;
      }

      setCooldownMinutes(minutes);
      Logger.info('TelegramCommand', `User ${ctx.from?.id} set cooldown duration -> ${minutes}m`);
      await ctx.reply(`✅ *Cooldown updated!*\nDurasi: *${minutes} menit* per token`, {
        parse_mode: 'Markdown',
      });
    });

    // Command: /cooldown
    this.bot.command('cooldown', async (ctx) => {
      Logger.info('TelegramCommand', `User ${ctx.from?.id} checked /cooldown`);
      const state = getState();
      await ctx.reply(`⏱ *Cooldown Aktif:* ${state.cooldownMinutes} menit per token`, {
        parse_mode: 'Markdown',
      });
    });

    // Command: /status
    this.bot.command('status', async (ctx) => {
      Logger.info('TelegramCommand', `User ${ctx.from?.id} checked /status`);
      const state = getState();
      const lastScan = getLastScanMap();
      const cooldownCount = getActiveCooldownCount();

      const formatScanTime = (date: Date | null) => (date ? formatWIBDate(date) : 'Belum scan');

      let msg = `📊 *Status GMGN Volume Tracker Bot*\n\n`;
      msg += `• *Status Bot:* ${state.isActive ? '🟢 AKTIF' : '🔴 PAUSED'}\n`;
      msg += `• *Poll Interval:* ${state.pollIntervalSeconds} detik\n`;
      msg += `• *Cooldown Durasi:* ${state.cooldownMinutes} menit\n`;
      msg += `• *Token Ter-cooldown:* ${cooldownCount} token\n\n`;
      msg += `*Last Scan:* \n`;
      msg += `  - SOL: ${formatScanTime(lastScan.sol)}\n`;
      msg += `  - BSC: ${formatScanTime(lastScan.bsc)}\n`;
      msg += `  - ROBINHOOD: ${formatScanTime(lastScan.robinhood)}\n\n`;
      msg += `*Thresholds:*\n`;
      msg += `  - SOL: ${formatCurrency(state.threshold.sol)}\n`;
      msg += `  - BSC: ${formatCurrency(state.threshold.bsc)}\n`;
      msg += `  - ROBINHOOD: ${formatCurrency(state.threshold.robinhood)}\n\n`;
      msg += `*Age Filters:*\n`;
      msg += `  - SOL: Min: ${state.ageFilter.sol.minAge || 'Off'} | Max: ${state.ageFilter.sol.maxAge || 'Off'}\n`;
      msg += `  - BSC: Min: ${state.ageFilter.bsc.minAge || 'Off'} | Max: ${state.ageFilter.bsc.maxAge || 'Off'}\n`;
      msg += `  - ROBINHOOD: Min: ${state.ageFilter.robinhood.minAge || 'Off'} | Max: ${state.ageFilter.robinhood.maxAge || 'Off'}`;

      await ctx.reply(msg, { parse_mode: 'Markdown' });
    });

    // Command: /pause
    this.bot.command('pause', async (ctx) => {
      setIsActive(false);
      Logger.info('TelegramCommand', `User ${ctx.from?.id} executed /pause`);
      await ctx.reply('⏸ *Scanning & Notifikasi dihentikan sementara.*', {
        parse_mode: 'Markdown',
      });
    });

    // Command: /resume
    this.bot.command('resume', async (ctx) => {
      setIsActive(true);
      Logger.info('TelegramCommand', `User ${ctx.from?.id} executed /resume`);
      await ctx.reply('▶️ *Scanning & Notifikasi dilanjutkan kembali.*', {
        parse_mode: 'Markdown',
      });
    });

    // Help command
    this.bot.command('help', async (ctx) => {
      Logger.info('TelegramCommand', `User ${ctx.from?.id} executed /help`);
      let msg = `🤖 *GMGN Volume Tracker Commands:*\n\n`;
      msg += `/threshold - Cek threshold volume aktif\n`;
      msg += `/setthreshold <chain> <amount> - Set threshold volume\n`;
      msg += `/age - Cek filter umur token (min/max age)\n`;
      msg += `/setmaxage <chain> <durasi> - Set batas umur maksimal (contoh: 30m, 1h, off)\n`;
      msg += `/setminage <chain> <durasi> - Set batas umur minimal (contoh: 5m, 10m, off)\n`;
      msg += `/interval - Cek frekuensi polling scanner\n`;
      msg += `/setinterval <detik> - Set frekuensi polling (contoh: 20, 15)\n`;
      msg += `/cooldown - Cek durasi cooldown aktif\n`;
      msg += `/setcooldown <menit> - Set durasi cooldown\n`;
      msg += `/status - Cek status bot & scanner\n`;
      msg += `/pause - Hentikan sementara scanner\n`;
      msg += `/resume - Lanjutkan scanner\n`;
      await ctx.reply(msg, { parse_mode: 'Markdown' });
    });
  }

  private async setupBotCommands() {
    if (!this.bot) return;
    try {
      await this.bot.telegram.setMyCommands([
        { command: 'status', description: 'Cek status bot, last scan & age filter' },
        { command: 'threshold', description: 'Lihat threshold volume aktif' },
        { command: 'setthreshold', description: 'Set threshold (<chain> <amount>)' },
        { command: 'age', description: 'Cek filter umur token (min/max age)' },
        { command: 'setmaxage', description: 'Set umur maksimal (<chain> <30m/1h/off>)' },
        { command: 'setminage', description: 'Set umur minimal (<chain> <5m/10m/off>)' },
        { command: 'interval', description: 'Lihat frekuensi polling scanner' },
        { command: 'setinterval', description: 'Set frekuensi polling (<detik>)' },
        { command: 'cooldown', description: 'Lihat durasi cooldown aktif' },
        { command: 'setcooldown', description: 'Set durasi cooldown (<menit>)' },
        { command: 'pause', description: 'Hentikan sementara scanning' },
        { command: 'resume', description: 'Lanjutkan kembali scanning' },
        { command: 'help', description: 'Tampilkan panduan perintah' },
      ]);
      Logger.info('Telegram', 'Bot commands menu registered with Telegram API.');
    } catch (err: any) {
      Logger.error('Telegram', `Failed setting bot commands: ${err?.message || err}`);
    }
  }

  public async launch() {
    if (!this.bot) {
      Logger.warn('Telegram', 'Cannot launch bot: token missing.');
      return;
    }
    await this.setupBotCommands();
    this.bot.launch();
    Logger.info('Telegram', 'Long polling bot started successfully.');
  }

  public stop(reason: string = 'Process terminated') {
    if (this.bot) {
      this.bot.stop(reason);
    }
  }

  public async sendAlert(alert: TokenAlert): Promise<boolean> {
    if (!this.bot || !this.targetChatId) {
      console.warn('[Telegram WARNING] Target Chat ID or Bot Token not configured. Cannot send alert.');
      return false;
    }

    const message = formatTelegramAlert(alert);

    return this.sendWithRetry(this.targetChatId, message);
  }

  private async sendWithRetry(chatId: string | number, message: string, retries = 1): Promise<boolean> {
    if (!this.bot) return false;

    try {
      await this.bot.telegram.sendMessage(chatId, message, {
        parse_mode: 'Markdown',
      });
      return true;
    } catch (err: any) {
      console.error('[Telegram Send Error]', err?.message || err);
      if (retries > 0) {
        await new Promise((res) => setTimeout(res, 1000));
        return this.sendWithRetry(chatId, message, retries - 1);
      }
      return false;
    }
  }
}

export const telegramService = new TelegramService();
