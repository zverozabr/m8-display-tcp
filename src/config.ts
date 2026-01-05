/**
 * Configuration from environment variables
 * Open/Closed principle - config through ENV, not hardcode
 */

function getEnvNumber(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (value === undefined) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

function getEnvString(key: string, defaultValue: string): string {
  return process.env[key] ?? defaultValue;
}

function getEnvBoolean(key: string, defaultValue: boolean): boolean {
  const value = process.env[key];
  if (value === undefined) return defaultValue;
  return value.toLowerCase() === "true" || value === "1";
}

export const config = {
  /**
   * HTTP server port
   * @env M8_HTTP_PORT
   * @default 8080
   */
  HTTP_PORT: getEnvNumber("M8_HTTP_PORT", 8080),

  /**
   * TCP proxy port for remote m8c clients
   * Set to 0 to disable TCP proxy
   * @env M8_TCP_PORT
   * @default 3333
   */
  TCP_PORT: getEnvNumber("M8_TCP_PORT", 3333),

  /**
   * Serial port path (auto-detect if empty)
   * @env M8_SERIAL_PORT
   * @default "" (auto-detect)
   */
  SERIAL_PORT: getEnvString("M8_SERIAL_PORT", ""),

  /**
   * Serial baud rate
   * @env M8_BAUD_RATE
   * @default 115200
   */
  BAUD_RATE: getEnvNumber("M8_BAUD_RATE", 115200),

  /**
   * Enable audio streaming over TCP
   * @env M8_AUDIO_ENABLED
   * @default true
   */
  AUDIO_ENABLED: getEnvBoolean("M8_AUDIO_ENABLED", true),

  /**
   * Auto-reconnect on disconnect
   * @env M8_AUTO_RECONNECT
   * @default true
   */
  AUTO_RECONNECT: getEnvBoolean("M8_AUTO_RECONNECT", true),

  /**
   * Reconnect interval in milliseconds
   * @env M8_RECONNECT_INTERVAL
   * @default 1000
   */
  RECONNECT_INTERVAL: getEnvNumber("M8_RECONNECT_INTERVAL", 1000),

  /**
   * Log level: debug, info, warn, error
   * @env M8_LOG_LEVEL
   * @default "info"
   */
  LOG_LEVEL: getEnvString("M8_LOG_LEVEL", "info"),
};

/**
 * Print current configuration (for debugging)
 */
export function printConfig(): void {
  console.log("M8 Display Server Configuration:");
  console.log(`  HTTP Port:      ${config.HTTP_PORT}`);
  console.log(`  TCP Port:       ${config.TCP_PORT || "(disabled)"}`);
  console.log(`  Serial Port:    ${config.SERIAL_PORT || "(auto-detect)"}`);
  console.log(`  Baud Rate:      ${config.BAUD_RATE}`);
  console.log(`  Audio Enabled:  ${config.AUDIO_ENABLED}`);
  console.log(`  Auto Reconnect: ${config.AUTO_RECONNECT}`);
  console.log(`  Log Level:      ${config.LOG_LEVEL}`);
}
