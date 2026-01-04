/**
 * RingBuffer - Lock-free circular buffer for audio streaming
 * Based on m8c ringbuffer.c logic
 */

export interface RingBufferOptions {
  allowOverwrite?: boolean;
}

export class RingBuffer {
  private buffer: Uint8Array;
  private readPos = 0;
  private writePos = 0;
  private count = 0;
  private readonly size: number;
  private readonly allowOverwrite: boolean;

  constructor(size: number, options: RingBufferOptions = {}) {
    this.size = size;
    this.buffer = new Uint8Array(size);
    this.allowOverwrite = options.allowOverwrite ?? false;
  }

  /**
   * Buffer capacity in bytes
   */
  get capacity(): number {
    return this.size;
  }

  /**
   * Current data length in buffer
   */
  get length(): number {
    return this.count;
  }

  /**
   * Available space for writing
   */
  get available(): number {
    return this.size - this.count;
  }

  /**
   * Push data into buffer
   * @returns bytes written, or -1 if overflow and !allowOverwrite
   */
  push(data: Uint8Array): number {
    const len = data.length;

    if (len > this.size) {
      // Data larger than buffer
      if (this.allowOverwrite) {
        // Keep only last 'size' bytes
        const offset = len - this.size;
        this.buffer.set(data.subarray(offset));
        this.readPos = 0;
        this.writePos = 0;
        this.count = this.size;
        return len;
      }
      return -1;
    }

    if (len > this.available) {
      if (!this.allowOverwrite) {
        return -1; // Overflow
      }
      // Drop oldest data to make room
      const toDrop = len - this.available;
      this.readPos = (this.readPos + toDrop) % this.size;
      this.count -= toDrop;
    }

    // Write data, handling wraparound
    const firstChunk = Math.min(len, this.size - this.writePos);
    this.buffer.set(data.subarray(0, firstChunk), this.writePos);

    if (firstChunk < len) {
      // Wrap around
      this.buffer.set(data.subarray(firstChunk), 0);
    }

    this.writePos = (this.writePos + len) % this.size;
    this.count += len;

    return len;
  }

  /**
   * Pop data from buffer
   * @returns bytes read (may be less than output.length)
   */
  pop(output: Uint8Array): number {
    const toRead = Math.min(output.length, this.count);
    if (toRead === 0) return 0;

    // Read data, handling wraparound
    const firstChunk = Math.min(toRead, this.size - this.readPos);
    output.set(this.buffer.subarray(this.readPos, this.readPos + firstChunk));

    if (firstChunk < toRead) {
      // Wrap around
      output.set(this.buffer.subarray(0, toRead - firstChunk), firstChunk);
    }

    this.readPos = (this.readPos + toRead) % this.size;
    this.count -= toRead;

    return toRead;
  }

  /**
   * Peek data without consuming
   * @returns bytes read
   */
  peek(output: Uint8Array): number {
    const toRead = Math.min(output.length, this.count);
    if (toRead === 0) return 0;

    const firstChunk = Math.min(toRead, this.size - this.readPos);
    output.set(this.buffer.subarray(this.readPos, this.readPos + firstChunk));

    if (firstChunk < toRead) {
      output.set(this.buffer.subarray(0, toRead - firstChunk), firstChunk);
    }

    return toRead;
  }

  /**
   * Clear all data
   */
  clear(): void {
    this.readPos = 0;
    this.writePos = 0;
    this.count = 0;
  }
}
