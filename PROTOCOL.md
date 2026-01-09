# M8 Remote Display Protocol v1.0

This document describes the TCP protocol used by m8-display server for remote M8 Tracker access.

## Overview

The protocol provides bidirectional communication between the server (connected to M8 via USB) and remote clients:

```
┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐
│   M8 Teensy     │◄──USB──►│   m8-display    │◄──TCP──►│   m8c-tcp       │
│   (Hardware)    │         │   (Server)      │         │   (Client)      │
└─────────────────┘         └─────────────────┘         └─────────────────┘
```

## Connection

- **Default Port:** 3333
- **Transport:** TCP
- **Encoding:** Binary

## Packet Format

### Server → Client

All packets from server to client follow this format:

```
┌────────┬──────────┬─────────────────┐
│ Header │ Length   │ Payload         │
│ 1 byte │ 2 bytes  │ N bytes         │
│        │ (BE)     │                 │
└────────┴──────────┴─────────────────┘
```

| Field | Size | Description |
|-------|------|-------------|
| Header | 1 byte | Packet type: `'D'` (0x44) or `'A'` (0x41) |
| Length | 2 bytes | Payload length (big-endian) |
| Payload | N bytes | SLIP data or PCM audio |

### Packet Types

#### Display Packet (`'D'` = 0x44)

Contains raw SLIP-encoded data from M8 serial port.

```
┌──────┬────────┬───────────────────────┐
│ 0x44 │ Length │ SLIP Frame            │
│      │ (BE)   │ (M8 display commands) │
└──────┴────────┴───────────────────────┘
```

The SLIP payload contains M8 display commands (draw text, rectangles, waveforms, etc.).

#### Audio Packet (`'A'` = 0x41)

Contains raw PCM audio data from M8 USB audio.

```
┌──────┬────────┬───────────────────────┐
│ 0x41 │ Length │ PCM Audio             │
│      │ (BE)   │ (S16_LE, 44100Hz, 2ch)│
└──────┴────────┴───────────────────────┘
```

Audio format:
- Sample rate: 44100 Hz
- Bit depth: 16-bit signed little-endian
- Channels: 2 (stereo interleaved)

### Client → Server

Clients send raw M8 commands directly (no framing):

| Command | Format | Description |
|---------|--------|-------------|
| Controller | `0x43 bitmask` | Button input |
| Keyjazz | `0x4B note velocity` | Note on |
| Keyjazz Off | `0x4B 0xFF` | Note off |
| Enable | `0x45` | Enable M8 display |
| Reset | `0x52` | Reset M8 display |
| Disconnect | `0x44` | Graceful disconnect |

## Button Bitmask

For controller command (`0x43`):

| Button | Bit | Hex | Decimal |
|--------|-----|-----|---------|
| EDIT | 0 | 0x01 | 1 |
| OPT | 1 | 0x02 | 2 |
| RIGHT | 2 | 0x04 | 4 |
| START | 3 | 0x08 | 8 |
| SHIFT | 4 | 0x10 | 16 |
| DOWN | 5 | 0x20 | 32 |
| UP | 6 | 0x40 | 64 |
| LEFT | 7 | 0x80 | 128 |

Multiple buttons: OR the bitmasks together.

Example: SHIFT + DOWN = 0x10 | 0x20 = 0x30 (48)

## SLIP Protocol

The display payload uses SLIP (Serial Line Internet Protocol) encoding:

| Byte | Meaning |
|------|---------|
| 0xC0 | Frame end marker |
| 0xDB 0xDC | Escaped 0xC0 |
| 0xDB 0xDD | Escaped 0xDB |

## M8 Display Commands

After SLIP decoding, M8 commands have this format:

| Command | ID | Format |
|---------|-----|--------|
| Draw Rectangle | 0xFE | `x y w h r g b` |
| Draw Character | 0xFD | `char x y fg_r fg_g fg_b bg_r bg_g bg_b` |
| Draw Waveform | 0xFC | `x y data[320]` |
| Joypad State | 0xFB | `state` |
| System Info | 0xFF | `version model...` |

## Example Session

### Client Connect Sequence

```
1. TCP connect to server:3333
2. Send Enable: [0x45]
3. Wait 500ms
4. Send Reset: [0x52]
5. Ready to receive display packets
```

### Sending Input

```
# Press UP button
Client → Server: [0x43, 0x40]

# Release (no buttons)
Client → Server: [0x43, 0x00]

# SHIFT + DOWN combo
Client → Server: [0x43, 0x30]
```

### Receiving Display

```
Server → Client: [0x44, 0x00, 0x15, <21 bytes SLIP data>]
                  │      └──────┘  └─────────────────────┘
                  │      Length=21 SLIP payload
                  └──────Header 'D'
```

## Implementation Notes

### For Client Developers

1. **Buffer Management**: TCP is stream-based. Buffer incoming data and parse packets by header + length.

2. **Reconnection**: Implement auto-reconnect on connection loss.

3. **Display Timing**: Display packets arrive at ~60 Hz. Client should render at display refresh rate.

4. **Audio Buffering**: Audio arrives in variable-sized chunks. Buffer ~100-200ms for smooth playback.

### For Server Developers

1. **Multiple Clients**: Server broadcasts display/audio to all connected clients.

2. **Input Merging**: When multiple clients send input, OR the bitmasks together.

3. **Backpressure**: If client can't keep up, consider dropping older packets.

## Reference Implementation

- **Server**: [m8-display](https://github.com/zverozabr/m8-display-tcp) (TypeScript/Node.js)
- **Client**: [m8c-tcp](https://github.com/zverozabr/m8c-tcp) (C/SDL3)

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-01 | Initial specification |

## License

This protocol specification is released under MIT license.
