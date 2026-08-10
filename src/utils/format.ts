import { TokenAlert, SupportedChain } from '../types';

export const formatCurrency = (val: number): string => {
  if (isNaN(val) || val === 0) return '$0';
  if (val >= 1_000_000_000) {
    return `$${(val / 1_000_000_000).toFixed(2)}B`;
  }
  if (val >= 1_000_000) {
    return `$${(val / 1_000_000).toFixed(2)}M`;
  }
  return `$${val.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
};

export const formatPrice = (val: number): string => {
  if (isNaN(val) || val === 0) return '$0';
  if (val < 0.0001) {
    return `$${val.toFixed(8)}`;
  }
  if (val < 1) {
    return `$${val.toFixed(6)}`;
  }
  return `$${val.toLocaleString('en-US', { maximumFractionDigits: 4 })}`;
};

export const getNativeSymbol = (chain: SupportedChain): string => {
  switch (chain) {
    case 'sol':
      return 'SOL';
    case 'bsc':
      return 'BNB';
    case 'robinhood':
      return 'ETH';
    default:
      return 'SOL';
  }
};

export const formatFee = (val: number, chain: SupportedChain): string => {
  const symbol = getNativeSymbol(chain);
  if (isNaN(val) || val === 0) return `0 ${symbol}`;

  let formatted = val.toLocaleString('en-US', { maximumFractionDigits: 4 });
  if (val < 0.0001 && val > 0) {
    formatted = val.toFixed(6);
  }
  return `${formatted} ${symbol}`;
};

export const formatTokenAge = (creationTimestamp?: number): string => {
  if (!creationTimestamp || creationTimestamp <= 0) return 'Unknown';

  const creationMs = creationTimestamp > 1e11 ? creationTimestamp : creationTimestamp * 1000;
  const diffSeconds = Math.max(0, Math.floor((Date.now() - creationMs) / 1000));

  if (diffSeconds < 60) {
    return `${diffSeconds} dtk`;
  }
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) {
    return `${diffMinutes} mnt`;
  }
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    const mins = diffMinutes % 60;
    return mins > 0 ? `${diffHours}j ${mins}m` : `${diffHours}j`;
  }
  const diffDays = Math.floor(diffHours / 24);
  const hours = diffHours % 24;
  return hours > 0 ? `${diffDays}h ${hours}j` : `${diffDays}h`;
};

export const formatWIBDate = (date: Date): string => {
  // Convert date to WIB (UTC+7)
  const options: Intl.DateTimeFormatOptions = {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Jakarta',
  };

  const formatted = new Intl.DateTimeFormat('id-ID', options).format(date);
  return `${formatted} WIB`;
};

export const formatTelegramAlert = (alert: TokenAlert): string => {
  const chainName = alert.chain.toUpperCase();
  const symbolStr = alert.symbol.startsWith('$')
    ? alert.symbol
    : `$${alert.symbol}`;
  const ageStr = alert.creationTimestamp ? formatTokenAge(alert.creationTimestamp) : undefined;
  const volumeStr = formatCurrency(alert.volume1m);
  const priceStr = formatPrice(alert.price);
  const mcapStr = formatCurrency(alert.marketCap);
  const feesStr =
    alert.fees1m !== undefined
      ? formatFee(alert.fees1m, alert.chain)
      : undefined;
  const timeStr = formatWIBDate(alert.detectedAt);

  let msg = `🚨 *Volume Alert — ${chainName}*\n\n`;
  msg += `*Token:* ${symbolStr}\n`;
  msg += `*CA:* \`${alert.address}\`\n`;
  if (ageStr) {
    msg += `*Age:* ${ageStr}\n`;
  }
  msg += `*Volume (1m):* ${volumeStr}\n`;
  msg += `*Price:* ${priceStr}\n`;
  msg += `*Market Cap:* ${mcapStr}\n`;
  if (feesStr) {
    msg += `*Total Fees (1m):* ${feesStr}\n`;
  }
  msg += `⏱ *Terdeteksi:* ${timeStr}`;

  return msg;
};
