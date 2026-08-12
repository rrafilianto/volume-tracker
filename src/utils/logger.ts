import { formatWIBDate } from './format';

export class Logger {
  private static getPrefix(tag: string): string {
    const time = formatWIBDate(new Date());
    return `[${time}] [${tag}]`;
  }

  public static info(tag: string, message: string, ...args: any[]): void {
    console.log(`${this.getPrefix(tag)} ${message}`, ...args);
  }

  public static warn(tag: string, message: string, ...args: any[]): void {
    console.warn(`${this.getPrefix(tag)} ⚠️ ${message}`, ...args);
  }

  public static error(tag: string, message: string, ...args: any[]): void {
    console.error(`${this.getPrefix(tag)} ❌ ${message}`, ...args);
  }
}
