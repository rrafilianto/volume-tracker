import { exec } from 'child_process';
import { promisify } from 'util';
import axios from 'axios';
import { SupportedChain, TokenAlert, GMGNTokenData } from '../types';

const execAsync = promisify(exec);

export class GMGNService {
  /**
   * Fetches high volume 1-minute tokens for a specific chain using GMGN CLI / OpenAPI
   * @param chain 'sol' | 'bsc' | 'robinhood'
   * @param minVolume Threshold volume 1m
   * @param ageFilter Optional minAge and maxAge filter (e.g. { maxAge: '1h', minAge: '5m' })
   */
  async fetchHighVolumeTokens(
    chain: SupportedChain,
    minVolume: number,
    ageFilter?: { minAge?: string; maxAge?: string }
  ): Promise<TokenAlert[]> {
    const apiKey = process.env.GMGN_API_KEY || process.env.GMGN_PRIVATE_KEY || '';

    try {
      // 1. Try fetching via official gmgn-cli (handles Cloudflare anti-bot and API key auth)
      const alerts = await this.fetchViaCLI(chain, minVolume, apiKey, ageFilter);
      return alerts;
    } catch (cliError: any) {
      console.warn(`[GMGN CLI Warning] CLI fetch for ${chain} failed: ${cliError?.message || cliError}. Trying fallback HTTP...`);
      
      // 2. Fallback to direct HTTP request if CLI is unavailable
      try {
        return await this.fetchViaHTTP(chain, minVolume, apiKey);
      } catch (httpError: any) {
        console.error(`[GMGN API Error] Failed fetching chain ${chain}:`, httpError?.response?.status || httpError?.message || httpError);
        return [];
      }
    }
  }

  private async fetchViaCLI(
    chain: SupportedChain,
    minVolume: number,
    apiKey: string,
    ageFilter?: { minAge?: string; maxAge?: string }
  ): Promise<TokenAlert[]> {
    const chainParam = chain === 'robinhood' ? 'robinhood' : chain;
    let command = `npx gmgn-cli market trending --chain ${chainParam} --interval 1m --min-volume ${minVolume}`;

    if (ageFilter?.maxAge) {
      command += ` --max-created ${ageFilter.maxAge}`;
    }
    if (ageFilter?.minAge) {
      command += ` --min-created ${ageFilter.minAge}`;
    }

    const env = {
      ...process.env,
      GMGN_API_KEY: apiKey,
      GMGN_PRIVATE_KEY: apiKey,
    };

    const { stdout } = await execAsync(command, { env, timeout: 10000 });

    const json = JSON.parse(stdout);
    const rawTokens: GMGNTokenData[] =
      json?.data?.rank || json?.rank || json?.data?.tokens || (Array.isArray(json) ? json : []);

    const alerts: TokenAlert[] = [];

    for (const item of rawTokens) {
      alerts.push({
        symbol: item.symbol || 'UNKNOWN',
        name: item.name || item.symbol || 'Unknown Token',
        address: item.address,
        chain,
        volume1m: Number(item.volume_1m ?? item.volume1m ?? item.volume ?? 0),
        price: Number(item.price ?? item.price_usd ?? 0),
        marketCap: Number(item.market_cap ?? item.marketCap ?? 0),
        fees1m: item.gas_fee !== undefined || item.fees_1m !== undefined || item.swaps_1m_fee !== undefined
          ? Number(item.gas_fee ?? item.fees_1m ?? item.swaps_1m_fee)
          : undefined,
        creationTimestamp: Number(item.creation_timestamp || item.open_timestamp || 0) || undefined,
        detectedAt: new Date(),
      });
    }

    return alerts;
  }

  private async fetchViaHTTP(chain: SupportedChain, minVolume: number, apiKey: string): Promise<TokenAlert[]> {
    const chainParam = chain === 'robinhood' ? 'robinhood' : chain;
    const url = `https://gmgn.ai/defi/quotation/v1/rank/${chainParam}/swaps/1m`;

    const response = await axios.get(url, {
      timeout: 8000,
      params: {
        orderby: 'volume',
        direction: 'desc',
        min_volume: minVolume,
        limit: 50,
      },
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}`, 'X-GMGN-KEY': apiKey } : {}),
      },
    });

    const data = response.data;
    const rawTokens: GMGNTokenData[] = data?.data?.rank || data?.data?.tokens || data?.rank || (Array.isArray(data) ? data : []);

    const alerts: TokenAlert[] = [];

    for (const item of rawTokens) {
      alerts.push({
        symbol: item.symbol || 'UNKNOWN',
        name: item.name || item.symbol || 'Unknown Token',
        address: item.address,
        chain,
        volume1m: Number(item.volume_1m ?? item.volume1m ?? item.volume ?? 0),
        price: Number(item.price ?? item.price_usd ?? 0),
        marketCap: Number(item.market_cap ?? item.marketCap ?? 0),
        fees1m: item.gas_fee !== undefined || item.fees_1m !== undefined || item.swaps_1m_fee !== undefined
          ? Number(item.gas_fee ?? item.fees_1m ?? item.swaps_1m_fee)
          : undefined,
        creationTimestamp: Number(item.creation_timestamp || item.open_timestamp || 0) || undefined,
        detectedAt: new Date(),
      });
    }

    return alerts;
  }
}

export const gmgnService = new GMGNService();

