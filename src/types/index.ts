export type SupportedChain = 'sol' | 'bsc' | 'robinhood';

export interface ChainThresholds {
  sol: number;
  bsc: number;
  robinhood: number;
}

export interface BotConfig {
  threshold: ChainThresholds;
  cooldownMinutes: number;
  isActive: boolean;
}

export interface TokenAlert {
  symbol: string;
  name: string;
  address: string;
  chain: SupportedChain;
  volume1m: number;
  price: number;
  marketCap: number;
  fees1m?: number;
  creationTimestamp?: number;
  detectedAt: Date;
}

export interface GMGNTokenData {
  address: string;
  symbol: string;
  name?: string;
  volume?: number;
  volume_1m?: number;
  volume1m?: number;
  price?: number;
  price_usd?: number;
  market_cap?: number;
  marketCap?: number;
  gas_fee?: number;
  swaps_1m_fee?: number;
  fees_1m?: number;
  creation_timestamp?: number;
  open_timestamp?: number;
}
