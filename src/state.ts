import { BotConfig, SupportedChain } from './types';

// State stored strictly in-memory (resets on process restart as per PRD design)
const config: BotConfig = {
  threshold: {
    sol: 50000,
    bsc: 50000,
    robinhood: 50000,
  },
  cooldownMinutes: 5,
  isActive: true,
};

// Key: `${chain}:${tokenAddress.toLowerCase()}`, Value: timestamp in ms when alert was sent
const cooldownMap = new Map<string, number>();

// Track last scan timestamps per chain
const lastScanMap: Record<SupportedChain, Date | null> = {
  sol: null,
  bsc: null,
  robinhood: null,
};

export const getState = () => config;

export const setThreshold = (chain: SupportedChain, amount: number): void => {
  config.threshold[chain] = amount;
};

export const setCooldownMinutes = (minutes: number): void => {
  config.cooldownMinutes = minutes;
};

export const setIsActive = (active: boolean): void => {
  config.isActive = active;
};

export const updateLastScan = (chain: SupportedChain): void => {
  lastScanMap[chain] = new Date();
};

export const getLastScanMap = () => lastScanMap;

export const isTokenInCooldown = (chain: SupportedChain, address: string): boolean => {
  const key = `${chain}:${address.toLowerCase()}`;
  const lastAlertTime = cooldownMap.get(key);

  if (!lastAlertTime) {
    return false;
  }

  const cooldownMs = config.cooldownMinutes * 60 * 1000;
  const elapsedMs = Date.now() - lastAlertTime;

  if (elapsedMs < cooldownMs) {
    return true;
  }

  // Cooldown expired, remove from map
  cooldownMap.delete(key);
  return false;
};

export const markTokenAlerted = (chain: SupportedChain, address: string): void => {
  const key = `${chain}:${address.toLowerCase()}`;
  cooldownMap.set(key, Date.now());
};

export const getActiveCooldownCount = (): number => {
  const cooldownMs = config.cooldownMinutes * 60 * 1000;
  const now = Date.now();
  let count = 0;

  for (const [key, timestamp] of cooldownMap.entries()) {
    if (now - timestamp < cooldownMs) {
      count++;
    } else {
      cooldownMap.delete(key);
    }
  }

  return count;
};
