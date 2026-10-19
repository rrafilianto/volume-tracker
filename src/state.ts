import fs from 'fs';
import path from 'path';
import { BotConfig, SupportedChain } from './types';
import { Logger } from './utils/logger';

const CONFIG_FILE = path.resolve(process.cwd(), 'data', 'config.json');

// Default initial config
const config: BotConfig = {
  threshold: {
    sol: 50000,
    bsc: 50000,
    robinhood: 50000,
  },
  ageFilter: {
    sol: {},
    bsc: {},
    robinhood: {},
  },
  chainActive: {
    sol: true,
    bsc: true,
    robinhood: true,
  },
  cooldownMinutes: 5,
  pollIntervalSeconds: 20,
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

// Persistence Helpers
function saveStateToFile(): void {
  try {
    const dir = path.dirname(CONFIG_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
  } catch (err: any) {
    Logger.error('State', `Failed saving config file: ${err?.message || err}`);
  }
}

function loadStateFromFile(): void {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = fs.readFileSync(CONFIG_FILE, 'utf-8');
      const loaded = JSON.parse(data);
      if (loaded.threshold) config.threshold = { ...config.threshold, ...loaded.threshold };
      if (loaded.ageFilter) config.ageFilter = { ...config.ageFilter, ...loaded.ageFilter };
      if (loaded.chainActive) config.chainActive = { ...config.chainActive, ...loaded.chainActive };
      if (typeof loaded.cooldownMinutes === 'number') config.cooldownMinutes = loaded.cooldownMinutes;
      if (typeof loaded.pollIntervalSeconds === 'number') config.pollIntervalSeconds = loaded.pollIntervalSeconds;
      if (typeof loaded.isActive === 'boolean') config.isActive = loaded.isActive;
      Logger.info('State', 'Restored configuration settings from data/config.json.');
    }
  } catch (err: any) {
    Logger.error('State', `Failed loading config file: ${err?.message || err}`);
  }
}

// Load state automatically on module import
loadStateFromFile();

export const getState = () => config;

export const setThreshold = (chain: SupportedChain, amount: number): void => {
  config.threshold[chain] = amount;
  saveStateToFile();
};

export const setMaxAge = (chain: SupportedChain, duration?: string): void => {
  config.ageFilter[chain].maxAge = duration;
  saveStateToFile();
};

export const setMinAge = (chain: SupportedChain, duration?: string): void => {
  config.ageFilter[chain].minAge = duration;
  saveStateToFile();
};

export const setCooldownMinutes = (minutes: number): void => {
  config.cooldownMinutes = minutes;
  saveStateToFile();
};

export const setPollIntervalSeconds = (seconds: number): void => {
  config.pollIntervalSeconds = seconds;
  saveStateToFile();
};

export const setIsActive = (active: boolean): void => {
  config.isActive = active;
  saveStateToFile();
};

export const setChainActive = (chain: SupportedChain, active: boolean): void => {
  config.chainActive[chain] = active;
  saveStateToFile();
};

export const isChainActive = (chain: SupportedChain): boolean => {
  return config.chainActive[chain] ?? true;
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
