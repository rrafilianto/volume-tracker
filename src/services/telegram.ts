import { Telegraf, Context } from 'telegraf';
import {
  getState,
  setThreshold,
  setCooldownMinutes,
  setIsActive,
  getLastScanMap,
  getActiveCooldownCount,
} from '../state';
import { SupportedChain, TokenAlert } from '../types';
import { formatTelegramAlert, formatCurrency, formatWIBDate } from '../utils/format';

export class TelegramService {
  private bot: Telegraf | null = null;
  private targetChatId: string | number | null = null;

  constructor() {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      console.warn('[Telegram WARNING] TELEGRAM_BOT_TOKEN is not defined in environment!');
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
      await ctx.reply(
        `✅ *Threshold updated!*\nChain: \`${chainInput.toUpperCase()}\`\nNew Threshold: *${formatCurrency(
          amountInput
        )}*`,
        { parse_mode: 'Markdown' }
      );
    });

    // Command: /threshold
    this.bot.command('threshold', async (ctx) => {
      const state = getState();
      let msg = `⚙️ *Threshold Volume 1m Saat Ini:*\n\n`;
      msg += `• *SOL:* ${formatCurrency(state.threshold.sol)}\n`;
      msg += `• *BSC:* ${formatCurrency(state.threshold.bsc)}\n`;
      msg += `• *ROBINHOOD:* ${formatCurrency(state.threshold.robinhood)}\n`;
      await ctx.reply(msg, { parse_mode: 'Markdown' });
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
      await ctx.reply(`✅ *Cooldown updated!*\nDurasi: *${minutes} menit* per token`, {
        parse_mode: 'Markdown',
      });
    });

    // Command: /cooldown
    this.bot.command('cooldown', async (ctx) => {
      const state = getState();
      await ctx.reply(`⏱ *Cooldown Aktif:* ${state.cooldownMinutes} menit per token`, {
        parse_mode: 'Markdown',
      });
    });

    // Command: /status
    this.bot.command('status', async (ctx) => {
      const state = getState();
      const lastScan = getLastScanMap();
      const cooldownCount = getActiveCooldownCount();

      const formatScanTime = (date: Date | null) => (date ? formatWIBDate(date) : 'Belum scan');

      let msg = `📊 *Status GMGN Volume Tracker Bot*\n\n`;
      msg += `• *Status Bot:* ${state.isActive ? '🟢 AKTIF' : '🔴 PAUSED'}\n`;
      msg += `• *Cooldown Durasi:* ${state.cooldownMinutes} menit\n`;
      msg += `• *Token Ter-cooldown:* ${cooldownCount} token\n\n`;
      msg += `*Last Scan:* \n`;
      msg += `  - SOL: ${formatScanTime(lastScan.sol)}\n`;
      msg += `  - BSC: ${formatScanTime(lastScan.bsc)}\n`;
      msg += `  - ROBINHOOD: ${formatScanTime(lastScan.robinhood)}\n\n`;
      msg += `*Thresholds:*\n`;
      msg += `  - SOL: ${formatCurrency(state.threshold.sol)}\n`;
      msg += `  - BSC: ${formatCurrency(state.threshold.bsc)}\n`;
      msg += `  - ROBINHOOD: ${formatCurrency(state.threshold.robinhood)}`;

      await ctx.reply(msg, { parse_mode: 'Markdown' });
    });

    // Command: /pause
    this.bot.command('pause', async (ctx) => {
      setIsActive(false);
      await ctx.reply('⏸ *Scanning & Notifikasi dihentikan sementara.*', {
        parse_mode: 'Markdown',
      });
    });

    // Command: /resume
    this.bot.command('resume', async (ctx) => {
      setIsActive(true);
      await ctx.reply('▶️ *Scanning & Notifikasi dilanjutkan kembali.*', {
        parse_mode: 'Markdown',
      });
    });

    // Help command
    this.bot.command('help', async (ctx) => {
      let msg = `🤖 *GMGN Volume Tracker Commands:*\n\n`;
      msg += `/threshold - Cek threshold volume aktif\n`;
      msg += `/setthreshold <chain> <amount> - Set threshold volume\n`;
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
        { command: 'status', description: 'Cek status bot & last scan' },
        { command: 'threshold', description: 'Lihat threshold volume aktif' },
        { command: 'setthreshold', description: 'Set threshold (<chain> <amount>)' },
        { command: 'cooldown', description: 'Lihat durasi cooldown aktif' },
        { command: 'setcooldown', description: 'Set durasi cooldown (<menit>)' },
        { command: 'pause', description: 'Hentikan sementara scanning' },
        { command: 'resume', description: 'Lanjutkan kembali scanning' },
        { command: 'help', description: 'Tampilkan panduan perintah' },
      ]);
      console.log('[Telegram Bot] Bot commands menu registered with Telegram API.');
    } catch (err: any) {
      console.error('[Telegram Error] Failed setting bot commands:', err?.message || err);
    }
  }

  public async launch() {
    if (!this.bot) {
      console.warn('[Telegram WARNING] Cannot launch bot: token missing.');
      return;
    }
    await this.setupBotCommands();
    this.bot.launch();
    console.log('[Telegram Bot] Long polling bot started successfully.');
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
