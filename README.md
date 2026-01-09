# M8 Display Server

Remote display and control server for [Dirtywave M8 Tracker](https://dirtywave.com/). Mirrors the M8 display via USB, enables keyboard/gamepad control through HTTP/WebSocket API, and streams audio to the browser.

## Features

- **Real-time display** - BMP streaming at 10 FPS via WebSocket
- **USB audio streaming** - Direct libusb capture, bypasses ALSA/PipeWire
- **REST API** - Control M8 via HTTP endpoints
- **WebSocket control** - Low-latency input via WebSocket
- **TCP proxy** - Connect remote m8c clients over network
- **Docker support** - Easy deployment with USB passthrough
- **Web UI** - Browser-based control panel at http://localhost:8080

## Quick Start

```bash
# 1. Install
git clone https://github.com/zverozabr/m8-display-tcp.git
cd m8-display && npm install

# 2. Check system (diagnoses issues, shows suggestions)
npm run setup

# 3. Start server
npm start

# 4. Open browser
open http://localhost:8080
```

### Docker

```bash
docker compose up -d
# Or manually:
docker run -d --name m8-display \
  --network=host --privileged \
  -v /dev:/dev \
  m8-display:latest
```

## Requirements

- Node.js 20+ (or Docker)
- **M8 Tracker** OR **Teensy 4.1 with [M8 Headless firmware](https://github.com/Dirtywave/M8HeadlessFirmware)**
- Linux (for native USB audio capture)

### Supported Hardware

| Device | USB VID:PID | Port | Notes |
|--------|-------------|------|-------|
| M8 Tracker (hardware) | 16c0:0485 | /dev/ttyACM0 | Original Dirtywave device |
| Teensy 4.1 (headless) | 16c0:0485 | /dev/ttyACM0 | Requires M8 Headless firmware |

### M8 Headless Firmware

For Teensy 4.1 users:
1. Download firmware from [M8HeadlessFirmware releases](https://github.com/Dirtywave/M8HeadlessFirmware/releases)
2. Flash using [Teensy Loader](https://www.pjrc.com/teensy/loader.html)
3. Insert SD card with M8 file structure
4. Connect via USB - appears as `/dev/ttyACM0`

### Port Detection

The server auto-detects M8 on USB ports:

```bash
# List available ports
npm run setup

# Manual port selection
npx tsx src/index.ts -p /dev/ttyACM0

# Common port locations:
# Linux:   /dev/ttyACM0, /dev/ttyACM1
# macOS:   /dev/tty.usbmodem*
# Windows: COM3, COM4 (use WSL2 with usbipd)
```

**Troubleshooting ports:**
```bash
# Find M8 device
lsusb | grep "16c0:0485"

# Check serial ports
ls -la /dev/ttyACM*

# Add user to dialout group (Linux)
sudo usermod -a -G dialout $USER
# Logout/login required
```

## Installation

```bash
# Clone and install
cd m8-display
npm install
```

## Usage

```bash
# Start server (auto-detects M8)
npm start

# Or with tsx directly
npx tsx src/index.ts

# Options
npx tsx src/index.ts --help
npx tsx src/index.ts -p /dev/ttyACM0  # Specific port
npx tsx src/index.ts -h 3000          # HTTP on port 3000
npx tsx src/index.ts -t 0             # Disable TCP proxy
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `M8_HTTP_PORT` | 8080 | HTTP/WebSocket server port |
| `M8_TCP_PORT` | 3333 | TCP proxy port (0 to disable) |
| `M8_SERIAL_PORT` | (auto) | Serial port path |
| `M8_BAUD_RATE` | 115200 | Serial baud rate |
| `M8_AUTO_RECONNECT` | true | Auto-reconnect on disconnect |
| `M8_AUDIO_ENABLED` | true | Enable audio streaming |
| `M8_LOG_LEVEL` | info | Log level: debug, info, warn, error |

### Docker USB Access

Update `docker-compose.yml` with your M8 device path:

```yaml
devices:
  - /dev/ttyACM0:/dev/ttyACM0
```

Find your device: `ls -la /dev/ttyACM*` or `lsusb | grep 16c0`

## API Reference

### REST Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Connection status |
| GET | `/api/health/detailed` | Full diagnostics + suggestions |
| GET | `/api/screen` | Screen buffer (JSON) |
| GET | `/api/screen/text` | Screen as text |
| GET | `/api/screen/image` | Screen as BMP |
| POST | `/api/key/:key` | Send key (up/down/left/right/shift/start/opt/edit) |
| POST | `/api/keys` | Send combo `{"hold":"shift","press":"up"}` |
| POST | `/api/raw` | Raw bitmask `{"bitmask":32,"holdMs":60}` |
| POST | `/api/note` | Note on `{"note":60,"vel":100}` |
| POST | `/api/note/off` | Note off |
| POST | `/api/reset` | Reset display |

### WebSocket Endpoints

| Path | Type | Description |
|------|------|-------------|
| `/control` | JSON | Input control (keys, notes) |
| `/screen` | Binary | BMP images (10 FPS) |
| `/audio` | Binary | PCM audio (S16_LE, 44100Hz, stereo) |
| `/display` | Binary | Raw SLIP frames (for m8c) |

### TCP Protocol (Port 3333)

For native clients like [m8c-tcp](https://github.com/zverozabr/m8c-tcp):

```
Display Packet: 'D' + 2-byte length (BE) + SLIP data
Audio Packet:   'A' + 2-byte length (BE) + PCM data

Client → Server: Raw M8 commands
  'C' + bitmask     - Controller input
  'K' + note + vel  - Keyjazz note
  'E'               - Enable display
  'R'               - Reset display
```

### Key Bitmasks

For `/api/raw` endpoint:

| Key | Bit | Decimal |
|-----|-----|---------|
| EDIT | 0 | 1 |
| OPT | 1 | 2 |
| RIGHT | 2 | 4 |
| START | 3 | 8 |
| SHIFT | 4 | 16 |
| DOWN | 5 | 32 |
| UP | 6 | 64 |
| LEFT | 7 | 128 |

Combos: add bitmasks together (e.g., SHIFT+DOWN = 16+32 = 48)

## Web UI

Open http://localhost:8080 in browser:

- **D-pad** - Navigation
- **SHIFT/PLAY** - Modifier and playback
- **OPT/EDIT** - M8 function keys
- **Audio button** - Toggle browser audio streaming

### Browser Audio

1. Click the mute button (will show speaker icon when active)
2. Press PLAY on M8 to start playback
3. Audio streams directly to browser

## Architecture

```
src/
├── index.ts           # Entry point
├── config.ts          # Environment configuration
├── serial/
│   ├── connection.ts  # M8 USB serial connection
│   ├── slip.ts        # SLIP protocol decoder
│   └── commands.ts    # M8 command parser
├── server/
│   ├── http.ts        # HTTP/WebSocket server
│   ├── tcp-proxy.ts   # TCP proxy for m8c clients
│   ├── helpers.ts     # Common HTTP helpers
│   └── routes/        # API routes (SOLID)
│       ├── health.ts  # /api/health
│       ├── screen.ts  # /api/screen/*
│       └── input.ts   # /api/key, /api/keys, /api/raw
├── display/
│   ├── framebuffer.ts # Pixel buffer + BMP export
│   └── buffer.ts      # Text buffer
├── audio/
│   ├── native-capture.ts  # Native libusb audio capture
│   ├── usb-streamer.ts    # WebSocket audio streaming
│   └── audio-hub.ts       # Multi-client distribution
├── state/
│   └── tracker.ts     # M8 state tracking
└── usb/
    └── reset.ts       # USB reset utilities
```

## Troubleshooting

### M8 not detected

```bash
# Run diagnostics
npm run setup

# Check USB
lsusb | grep 16c0
ls -la /dev/ttyACM*

# Check health API
curl http://localhost:8080/api/health/detailed | jq
```

### Audio not working

```bash
# Install ALSA utils
sudo apt-get install alsa-utils

# Check M8 audio
arecord -l | grep M8

# Add to audio group
sudo usermod -aG audio $USER && logout
```

### Docker issues

```bash
# Ensure devices are mounted
docker exec m8-display ls -la /dev/ttyACM0
docker exec m8-display arecord -l

# Check logs
docker logs m8-display
```

## Development

```bash
# Run with watch mode
npm run dev

# Run tests (200+ unit tests)
npm test

# Run E2E tests (requires M8)
npm run test:e2e
```

## License

MIT

## Credits

- [Dirtywave M8](https://dirtywave.com/) - The amazing tracker
- [m8c](https://github.com/laamaa/m8c) - Original M8 headless client (protocol reference)
- [M8WebDisplay](https://github.com/derkyjadex/M8WebDisplay) - Web display inspiration and protocol insights
