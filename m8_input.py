#!/usr/bin/env python3
"""M8 input helper - sends raw commands via serial"""
import serial
import sys
import time

PORT = '/dev/ttyACM0'
BAUD = 115200

def send_command(bitmask: int, hold_ms: int = 100):
    """Send button command to M8"""
    with serial.Serial(PORT, BAUD, timeout=0.1) as ser:
        # Press
        ser.write(bytes([0x43, bitmask]))
        ser.flush()
        time.sleep(hold_ms / 1000)
        # Release
        ser.write(bytes([0x43, 0x00]))
        ser.flush()
        time.sleep(0.05)

def send_note(note: int, vel: int = 100):
    """Send note on"""
    with serial.Serial(PORT, BAUD, timeout=0.1) as ser:
        ser.write(bytes([0x4B, note, vel]))
        ser.flush()

def send_note_off():
    """Send note off"""
    with serial.Serial(PORT, BAUD, timeout=0.1) as ser:
        ser.write(bytes([0x4B, 0xFF]))
        ser.flush()

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: m8_input.py <bitmask> [hold_ms]")
        sys.exit(1)
    
    bitmask = int(sys.argv[1])
    hold_ms = int(sys.argv[2]) if len(sys.argv) > 2 else 100
    send_command(bitmask, hold_ms)
    print(f"OK: bitmask={bitmask} hold={hold_ms}ms")
