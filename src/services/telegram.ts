import { Telegraf, Context, Markup } from 'telegraf';
import {
  getState,
  setThreshold,
  setMaxAge,
  setMinAge,
  setCooldownMinutes,
  setPollIntervalSeconds,
  setIsActive,
  setChainActive,
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

    // Command: /settings or /menu - Interactive Control Panel
    this.bot.command(['settings', 'menu', 'config'], async (ctx) => {
      Logger.info('TelegramCommand', `User ${ctx.from?.id} opened /settings`);
      const menu = this.renderMainMenu();
      await ctx.reply(menu.text, { parse_mode: 'Markdown', ...menu.keyboard });
    });

    // Action: Toggle chains (SOL, BSC, ROBINHOOD)
    this.bot.action(/^toggle_chain_(sol|bsc|robinhood)$/, async (ctx) => {
      const match = (ctx as any).match;
      const chain = match[1] as SupportedChain;
      const state = getState();
      const current = state.chainActive?.[chain] !== false;
      const nextState = !current;
      setChainActive(chain, nextState);
      Logger.info('TelegramAction', `User ${ctx.from?.id} toggled ${chain.toUpperCase()} -> ${nextState ? 'ON' : 'OFF'}`);
      await ctx.answerCbQuery(`Chain ${chain.toUpperCase()}: ${nextState ? '🟢 AKTIF' : '🔴 NONAKTIF'}`);
      const menu = this.renderMainMenu();
      await this.safeEditMessage(ctx, menu.text, menu.keyboard);
    });

    // Action: Pause scanner
    this.bot.action('toggle_pause', async (ctx) => {
      setIsActive(false);
      Logger.info('TelegramAction', `User ${ctx.from?.id} paused scanner via menu`);
      await ctx.answerCbQuery('⏸ Scanner dihentikan sementara');
      const menu = this.renderMainMenu();
      await this.safeEditMessage(ctx, menu.text, menu.keyboard);
    });

    // Action: Resume scanner
    this.bot.action('toggle_resume', async (ctx) => {
      setIsActive(true);
      Logger.info('TelegramAction', `User ${ctx.from?.id} resumed scanner via menu`);
      await ctx.answerCbQuery('▶️ Scanner dilanjutkan');
      const menu = this.renderMainMenu();
      await this.safeEditMessage(ctx, menu.text, menu.keyboard);
    });

    // Action: Return to main menu / Refresh
    this.bot.action('menu_main', async (ctx) => {
      await ctx.answerCbQuery('🔄 Data diperbarui');
      const menu = this.renderMainMenu();
      await this.safeEditMessage(ctx, menu.text, menu.keyboard);
    });

    // Action: Show Threshold submenu
    this.bot.action('menu_threshold', async (ctx) => {
      await ctx.answerCbQuery();
      const menu = this.renderThresholdMenu();
      await this.safeEditMessage(ctx, menu.text, menu.keyboard);
    });

    // Action: Show Timing submenu
    this.bot.action('menu_timing', async (ctx) => {
      await ctx.answerCbQuery();
      const menu = this.renderTimingMenu();
      await this.safeEditMessage(ctx, menu.text, menu.keyboard);
    });

    // Action: Set threshold preset
    this.bot.action(/^set_th_(sol|bsc|robinhood)_(\d+)$/, async (ctx) => {
      const match = (ctx as any).match;
      const chain = match[1] as SupportedChain;
      const amount = parseInt(match[2], 10);
      setThreshold(chain, amount);
      Logger.info('TelegramAction', `User ${ctx.from?.id} set threshold ${chain.toUpperCase()} -> $${amount}`);
      await ctx.answerCbQuery(`Threshold ${chain.toUpperCase()} diubah ke ${formatCurrency(amount)}`);
      const menu = this.renderThresholdMenu();
      await this.safeEditMessage(ctx, menu.text, menu.keyboard);
    });

    // Action: Set interval preset
    this.bot.action(/^set_interval_(\d+)$/, async (ctx) => {
      const match = (ctx as any).match;
      const seconds = parseInt(match[1], 10);
      setPollIntervalSeconds(seconds);
      scannerService.updateInterval(seconds);
      Logger.info('TelegramAction', `User ${ctx.from?.id} set poll interval -> ${seconds}s`);
      await ctx.answerCbQuery(`Interval scan diubah ke ${seconds}s`);
      const menu = this.renderTimingMenu();
      await this.safeEditMessage(ctx, menu.text, menu.keyboard);
    });

    // Action: Set cooldown preset
    this.bot.action(/^set_cd_(\d+)$/, async (ctx) => {
      const match = (ctx as any).match;
      const minutes = parseInt(match[1], 10);
      setCooldownMinutes(minutes);
      Logger.info('TelegramAction', `User ${ctx.from?.id} set cooldown -> ${minutes}m`);
      await ctx.answerCbQuery(`Cooldown diubah ke ${minutes} menit`);
      const menu = this.renderTimingMenu();
      await this.safeEditMessage(ctx, menu.text, menu.keyboard);
    });

    // Action: Close menu
    this.bot.action('menu_close', async (ctx) => {
      await ctx.answerCbQuery('Menu ditutup.');
      try {
        await ctx.deleteMessage();
      } catch (e) {}
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

    // Command: /chains or /chain
    this.bot.command(['chains', 'chain'], async (ctx) => {
      Logger.info('TelegramCommand', `User ${ctx.from?.id} checked /chains`);
      const state = getState();
      let msg = `⛓ *Status Tracker Volume Per Chain:*\n\n`;
      msg += `• *SOL:* ${state.chainActive?.sol !== false ? '🟢 AKTIF' : '🔴 NONAKTIF'}\n`;
      msg += `• *BSC:* ${state.chainActive?.bsc !== false ? '🟢 AKTIF' : '🔴 NONAKTIF'}\n`;
      msg += `• *ROBINHOOD:* ${state.chainActive?.robinhood !== false ? '🟢 AKTIF' : '🔴 NONAKTIF'}\n\n`;
      msg += `_Gunakan command berikut untuk menyalakan/mematikan:_\n`;
      msg += `\`/setchain <chain> <on/off>\`\n`;
      msg += `_Contoh:_ \`/setchain sol off\` atau \`/setchain bsc on\``;
      await ctx.reply(msg, { parse_mode: 'Markdown' });
    });

    // Command: /setchain <chain> <on/off>
    this.bot.command('setchain', async (ctx) => {
      const parts = ctx.message.text.trim().split(/\s+/);
      if (parts.length < 3) {
        await ctx.reply(
          '❌ *Format salah.*\nGunakan: `/setchain <chain> <on/off>`\nContoh: `/setchain sol off` atau `/setchain bsc on`',
          { parse_mode: 'Markdown' }
        );
        return;
      }

      const chainInput = parts[1].toLowerCase() as SupportedChain;
      const statusInput = parts[2].toLowerCase();

      const validChains: SupportedChain[] = ['sol', 'bsc', 'robinhood'];
      if (!validChains.includes(chainInput)) {
        await ctx.reply(`❌ Chain tidak valid! Pilihan chain: \`sol\`, \`bsc\`, \`robinhood\``, {
          parse_mode: 'Markdown',
        });
        return;
      }

      let isActive: boolean;
      if (['on', 'aktif', 'enable', '1', 'true'].includes(statusInput)) {
        isActive = true;
      } else if (['off', 'nonaktif', 'disable', '0', 'false'].includes(statusInput)) {
        isActive = false;
      } else {
        await ctx.reply(
          '❌ *Status tidak valid!*\nGunakan `on` (aktif) atau `off` (nonaktif).\nContoh: `/setchain sol off` atau `/setchain sol on`',
          { parse_mode: 'Markdown' }
        );
        return;
      }

      setChainActive(chainInput, isActive);
      Logger.info(
        'TelegramCommand',
        `User ${ctx.from?.id} updated chain active state: ${chainInput.toUpperCase()} -> ${isActive ? 'ON' : 'OFF'}`
      );
      await ctx.reply(
        `✅ *Status Tracker Chain Diperbarui!*\nChain: \`${chainInput.toUpperCase()}\`\nStatus: ${
          isActive ? '🟢 *AKTIF*' : '🔴 *NONAKTIF*'
        }`,
        { parse_mode: 'Markdown' }
      );
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
      msg += `*Status Chain Tracker:*\n`;
      msg += `  - SOL: ${state.chainActive?.sol !== false ? '🟢 Aktif' : '🔴 Nonaktif'}\n`;
      msg += `  - BSC: ${state.chainActive?.bsc !== false ? '🟢 Aktif' : '🔴 Nonaktif'}\n`;
      msg += `  - ROBINHOOD: ${state.chainActive?.robinhood !== false ? '🟢 Aktif' : '🔴 Nonaktif'}\n\n`;
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
      msg += `/settings atau /menu - 🎛 Buka Control Panel Interaktif\n`;
      msg += `/chains - Cek status aktif/nonaktif tracker tiap chain\n`;
      msg += `/setchain <chain> <on/off> - Aktifkan atau nonaktifkan tracker chain (contoh: /setchain sol off)\n`;
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
        { command: 'settings', description: '🎛 Buka Control Panel Interaktif (Menu)' },
        { command: 'status', description: 'Cek status bot, chain tracker & age filter' },
        { command: 'chains', description: 'Lihat status aktif/nonaktif tiap chain' },
        { command: 'setchain', description: 'Aktif/nonaktifkan chain (<chain> <on/off>)' },
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

  public renderMainMenu() {
    const state = getState();
    const solActive = state.chainActive?.sol !== false;
    const bscActive = state.chainActive?.bsc !== false;
    const robinActive = state.chainActive?.robinhood !== false;

    let text = `⚙️ *GMGN Volume Tracker — Control Panel*\n\n`;
    text += `• *Status Scanner:* ${state.isActive ? '🟢 AKTIF' : '🔴 PAUSED'}\n`;
    text += `• *Poll Interval:* ${state.pollIntervalSeconds} detik | *Cooldown:* ${state.cooldownMinutes} menit\n\n`;
    text += `*Status Chain Tracker:*\n`;
    text += `  - SOL: ${solActive ? '🟢 Aktif' : '🔴 Nonaktif'} (${formatCurrency(state.threshold.sol)})\n`;
    text += `  - BSC: ${bscActive ? '🟢 Aktif' : '🔴 Nonaktif'} (${formatCurrency(state.threshold.bsc)})\n`;
    text += `  - ROBINHOOD: ${robinActive ? '🟢 Aktif' : '🔴 Nonaktif'} (${formatCurrency(state.threshold.robinhood)})\n\n`;
    text += `_Klik tombol di bawah untuk mengubah pengaturan seketika:_`;

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback(`SOL: ${solActive ? '🟢 ON' : '🔴 OFF'}`, 'toggle_chain_sol'),
        Markup.button.callback(`BSC: ${bscActive ? '🟢 ON' : '🔴 OFF'}`, 'toggle_chain_bsc'),
        Markup.button.callback(`ROBIN: ${robinActive ? '🟢 ON' : '🔴 OFF'}`, 'toggle_chain_robinhood'),
      ],
      [
        state.isActive
          ? Markup.button.callback('⏸ Pause Scanner', 'toggle_pause')
          : Markup.button.callback('▶️ Resume Scanner', 'toggle_resume'),
        Markup.button.callback('🔄 Refresh Status', 'menu_main'),
      ],
      [
        Markup.button.callback('💰 Ubah Threshold', 'menu_threshold'),
        Markup.button.callback('⏱ Interval & Cooldown', 'menu_timing'),
      ],
      [
        Markup.button.callback('❌ Tutup Menu', 'menu_close'),
      ],
    ]);

    return { text, keyboard };
  }

  public renderThresholdMenu() {
    const state = getState();
    let text = `💰 *Pengaturan Preset Threshold Volume (1m)*\n\n`;
    text += `Threshold saat ini:\n`;
    text += `• *SOL:* ${formatCurrency(state.threshold.sol)}\n`;
    text += `• *BSC:* ${formatCurrency(state.threshold.bsc)}\n`;
    text += `• *ROBINHOOD:* ${formatCurrency(state.threshold.robinhood)}\n\n`;
    text += `_Pilih preset di bawah untuk mengubah batas volume alert:_`;

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback(`SOL $25k${state.threshold.sol === 25000 ? ' ✅' : ''}`, 'set_th_sol_25000'),
        Markup.button.callback(`SOL $50k${state.threshold.sol === 50000 ? ' ✅' : ''}`, 'set_th_sol_50000'),
        Markup.button.callback(`SOL $100k${state.threshold.sol === 100000 ? ' ✅' : ''}`, 'set_th_sol_100000'),
      ],
      [
        Markup.button.callback(`BSC $25k${state.threshold.bsc === 25000 ? ' ✅' : ''}`, 'set_th_bsc_25000'),
        Markup.button.callback(`BSC $50k${state.threshold.bsc === 50000 ? ' ✅' : ''}`, 'set_th_bsc_50000'),
        Markup.button.callback(`BSC $100k${state.threshold.bsc === 100000 ? ' ✅' : ''}`, 'set_th_bsc_100000'),
      ],
      [
        Markup.button.callback(`ROBIN $25k${state.threshold.robinhood === 25000 ? ' ✅' : ''}`, 'set_th_robinhood_25000'),
        Markup.button.callback(`ROBIN $50k${state.threshold.robinhood === 50000 ? ' ✅' : ''}`, 'set_th_robinhood_50000'),
        Markup.button.callback(`ROBIN $100k${state.threshold.robinhood === 100000 ? ' ✅' : ''}`, 'set_th_robinhood_100000'),
      ],
      [
        Markup.button.callback('🔙 Kembali ke Menu Utama', 'menu_main'),
      ],
    ]);

    return { text, keyboard };
  }

  public renderTimingMenu() {
    const state = getState();
    let text = `⏱ *Pengaturan Polling Scanner & Cooldown Alert*\n\n`;
    text += `• *Poll Interval Scanner:* ${state.pollIntervalSeconds} detik\n`;
    text += `• *Cooldown Notifikasi:* ${state.cooldownMinutes} menit\n\n`;
    text += `_Pilih nilai preset di bawah:_`;

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback(`⏱ 10s${state.pollIntervalSeconds === 10 ? ' ✅' : ''}`, 'set_interval_10'),
        Markup.button.callback(`⏱ 15s${state.pollIntervalSeconds === 15 ? ' ✅' : ''}`, 'set_interval_15'),
        Markup.button.callback(`⏱ 20s${state.pollIntervalSeconds === 20 ? ' ✅' : ''}`, 'set_interval_20'),
        Markup.button.callback(`⏱ 30s${state.pollIntervalSeconds === 30 ? ' ✅' : ''}`, 'set_interval_30'),
      ],
      [
        Markup.button.callback(`⏳ 3m${state.cooldownMinutes === 3 ? ' ✅' : ''}`, 'set_cd_3'),
        Markup.button.callback(`⏳ 5m${state.cooldownMinutes === 5 ? ' ✅' : ''}`, 'set_cd_5'),
        Markup.button.callback(`⏳ 10m${state.cooldownMinutes === 10 ? ' ✅' : ''}`, 'set_cd_10'),
        Markup.button.callback(`⏳ 15m${state.cooldownMinutes === 15 ? ' ✅' : ''}`, 'set_cd_15'),
      ],
      [
        Markup.button.callback('🔙 Kembali ke Menu Utama', 'menu_main'),
      ],
    ]);

    return { text, keyboard };
  }

  private async safeEditMessage(ctx: Context, text: string, keyboard: any) {
    try {
      await ctx.editMessageText(text, {
        parse_mode: 'Markdown',
        ...keyboard,
      });
    } catch (err: any) {
      if (!err?.message?.includes('message is not modified')) {
        Logger.error('TelegramMenu', `Failed to edit message: ${err?.message || err}`);
      }
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
