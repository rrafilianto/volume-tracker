import { getState, isTokenInCooldown, markTokenAlerted, updateLastScan } from '../state';
import { SupportedChain } from '../types';
import { gmgnService } from './gmgn';
import { telegramService } from './telegram';

export class ScannerService {
  private timer: NodeJS.Timeout | null = null;
  private isScanning = false;
  private chains: SupportedChain[] = ['sol', 'bsc', 'robinhood'];

  public start(intervalMs: number = 5000) {
    if (this.timer) {
      clearInterval(this.timer);
    }

    console.log(`[Scanner] Service started. Polling every ${intervalMs}ms...`);
    
    // Run initial scan immediately
    this.runScanCycle();

    // Schedule regular polling
    this.timer = setInterval(() => {
      this.runScanCycle();
    }, intervalMs);
  }

  public stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      console.log('[Scanner] Service stopped.');
    }
  }

  private async runScanCycle() {
    const state = getState();
    if (!state.isActive) {
      return;
    }

    // Prevent overlapping scans if previous cycle took longer than interval
    if (this.isScanning) {
      return;
    }

    this.isScanning = true;

    try {
      // Scan each supported chain independently
      for (const chain of this.chains) {
        await this.scanChain(chain);
      }
    } catch (err: any) {
      console.error('[Scanner Cycle Error]', err?.message || err);
    } finally {
      this.isScanning = false;
    }
  }

  private async scanChain(chain: SupportedChain) {
    const state = getState();
    const threshold = state.threshold[chain];

    try {
      // Fetch high volume 1-minute tokens from GMGN API
      const ageFilter = state.ageFilter[chain];
      const alerts = await gmgnService.fetchHighVolumeTokens(chain, threshold, ageFilter);
      updateLastScan(chain);

      for (const alert of alerts) {
        // Check cooldown map
        if (isTokenInCooldown(chain, alert.address)) {
          continue;
        }

        // Send alert to Telegram
        const sent = await telegramService.sendAlert(alert);
        if (sent) {
          markTokenAlerted(chain, alert.address);
          console.log(
            `[Alert Sent] Chain: ${chain.toUpperCase()} | Token: ${alert.symbol} | Volume1m: $${alert.volume1m}`
          );
        }
      }
    } catch (chainError: any) {
      console.error(`[Scanner Error] Failed scanning chain ${chain}:`, chainError?.message || chainError);
    }
  }
}

export const scannerService = new ScannerService();
