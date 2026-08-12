import { getState, isTokenInCooldown, markTokenAlerted, updateLastScan } from '../state';
import { SupportedChain } from '../types';
import { gmgnService } from './gmgn';
import { telegramService } from './telegram';
import { Logger } from '../utils/logger';

export class ScannerService {
  private timer: NodeJS.Timeout | null = null;
  private isScanning = false;
  private chains: SupportedChain[] = ['sol', 'bsc', 'robinhood'];

  public start(intervalMs?: number) {
    if (this.timer) {
      clearInterval(this.timer);
    }

    const state = getState();
    const activeIntervalMs = intervalMs ?? (state.pollIntervalSeconds * 1000);

    Logger.info('Scanner', `Service started. Polling every ${activeIntervalMs}ms (${activeIntervalMs / 1000}s)...`);
    
    // Run initial scan immediately
    this.runScanCycle();

    // Schedule regular polling
    this.timer = setInterval(() => {
      this.runScanCycle();
    }, activeIntervalMs);
  }

  public updateInterval(seconds: number) {
    const intervalMs = seconds * 1000;
    Logger.info('Scanner', `Updated poll interval dynamically to ${seconds}s (${intervalMs}ms).`);
    this.start(intervalMs);
  }

  public stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      Logger.info('Scanner', 'Service stopped.');
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
    const startTime = Date.now();
    Logger.info('ScannerCycle', '>>> Starting scan cycle across all chains...');

    try {
      // Scan each supported chain independently with 5s delay between chains
      for (let i = 0; i < this.chains.length; i++) {
        const chain = this.chains[i];
        await this.scanChain(chain);

        if (i < this.chains.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 5000));
        }
      }
      const durationMs = Date.now() - startTime;
      Logger.info('ScannerCycle', `<<< Scan cycle completed in ${durationMs}ms.`);
    } catch (err: any) {
      Logger.error('ScannerCycle', `Cycle error: ${err?.message || err}`);
    } finally {
      this.isScanning = false;
    }
  }

  private async scanChain(chain: SupportedChain) {
    const state = getState();
    const threshold = state.threshold[chain];
    const ageFilter = state.ageFilter[chain];

    const minAgeStr = ageFilter.minAge || 'off';
    const maxAgeStr = ageFilter.maxAge || 'off';
    Logger.info('ChainScan', `Scanning ${chain.toUpperCase()} (Threshold: $${threshold.toLocaleString()}, Age: min=${minAgeStr} max=${maxAgeStr})...`);

    try {
      // Fetch high volume 1-minute tokens from GMGN API
      const alerts = await gmgnService.fetchHighVolumeTokens(chain, threshold, ageFilter);
      updateLastScan(chain);

      if (alerts.length === 0) {
        Logger.info('ChainScan', `${chain.toUpperCase()}: No tokens matched criteria.`);
        return;
      }

      Logger.info('ChainScan', `${chain.toUpperCase()}: ${alerts.length} token(s) matched criteria.`);

      for (const alert of alerts) {
        // Check cooldown map
        if (isTokenInCooldown(chain, alert.address)) {
          Logger.info('Cooldown', `Skipped ${chain.toUpperCase()}:${alert.symbol} (${alert.address.slice(0, 8)}...) - in cooldown.`);
          continue;
        }

        // Send alert to Telegram
        const sent = await telegramService.sendAlert(alert);
        if (sent) {
          markTokenAlerted(chain, alert.address);
          Logger.info(
            'AlertSent',
            `Chain: ${chain.toUpperCase()} | Token: ${alert.symbol} | Vol1m: $${alert.volume1m.toLocaleString()} | CA: ${alert.address}`
          );
        }
      }
    } catch (chainError: any) {
      Logger.error('ChainScan', `Failed scanning chain ${chain.toUpperCase()}: ${chainError?.message || chainError}`);
    }
  }
}

export const scannerService = new ScannerService();
