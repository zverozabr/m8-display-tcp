/**
 * SLIP (Serial Line Internet Protocol) Decoder
 * Decodes SLIP-encoded frames from M8 Tracker
 *
 * Protocol:
 * - 0xC0 (END) marks frame boundaries
 * - 0xDB (ESC) escapes special bytes:
 *   - 0xDB 0xDC → 0xC0
 *   - 0xDB 0xDD → 0xDB
 */

export const SLIP = {
  END: 0xC0,
  ESC: 0xDB,
  ESC_END: 0xDC,
  ESC_ESC: 0xDD,
} as const;

export type FrameCallback = (frame: Uint8Array) => void;

export enum SlipState {
  Normal = 0,
  Escape = 1,
}

export class SlipDecoder {
  private buffer: number[] = [];
  private state: SlipState = SlipState.Normal;
  private onFrame: FrameCallback;

  constructor(onFrame: FrameCallback) {
    this.onFrame = onFrame;
  }

  /**
   * Feed raw bytes from serial port
   */
  feed(data: Uint8Array): void {
    for (const byte of data) {
      this.processByte(byte);
    }
  }

  private processByte(byte: number): void {
    switch (this.state) {
      case SlipState.Normal:
        this.processNormalByte(byte);
        break;
      case SlipState.Escape:
        this.processEscapeByte(byte);
        break;
    }
  }

  private processNormalByte(byte: number): void {
    switch (byte) {
      case SLIP.END:
        // Frame complete
        if (this.buffer.length > 0) {
          this.onFrame(new Uint8Array(this.buffer));
          this.buffer = [];
        }
        break;
      case SLIP.ESC:
        // Next byte is escaped
        this.state = SlipState.Escape;
        break;
      default:
        // Regular data byte
        this.buffer.push(byte);
        break;
    }
  }

  private processEscapeByte(byte: number): void {
    this.state = SlipState.Normal;
    switch (byte) {
      case SLIP.ESC_END:
        // Escaped END → actual 0xC0
        this.buffer.push(SLIP.END);
        break;
      case SLIP.ESC_ESC:
        // Escaped ESC → actual 0xDB
        this.buffer.push(SLIP.ESC);
        break;
      default:
        // Invalid escape sequence, pass through
        this.buffer.push(byte);
        break;
    }
  }

  /**
   * Reset decoder state
   */
  reset(): void {
    this.buffer = [];
    this.state = SlipState.Normal;
  }

  /**
   * Get current buffer size (for debugging)
   */
  get bufferSize(): number {
    return this.buffer.length;
  }
}

/**
 * Encode data into SLIP frame
 */
export function slipEncode(data: Uint8Array): Uint8Array {
  const encoded: number[] = [];

  for (const byte of data) {
    switch (byte) {
      case SLIP.END:
        encoded.push(SLIP.ESC, SLIP.ESC_END);
        break;
      case SLIP.ESC:
        encoded.push(SLIP.ESC, SLIP.ESC_ESC);
        break;
      default:
        encoded.push(byte);
        break;
    }
  }

  // Add frame delimiter
  encoded.push(SLIP.END);

  return new Uint8Array(encoded);
}
