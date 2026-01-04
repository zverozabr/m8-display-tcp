# M8 Display Server

Remote display and control server for [Dirtywave M8 Tracker](https://dirtywave.com/). Mirrors the M8 display via USB, enables keyboard/gamepad control through HTTP/WebSocket API, and streams audio to the browser.

## Features

- **Real-time display** - JPEG streaming at 10 FPS via WebSocket
- **USB audio streaming** - Direct libusb capture, bypasses ALSA/PipeWire
- **REST API** - Control M8 via HTTP endpoints
- **WebSocket control** - Low-latency input via WebSocket
- **TCP proxy** - Connect remote m8c clients
- **Web UI** - Browser-based control panel at http://localhost:8080

## Requirements

- Node.js 20+
- M8 Tracker connected via USB
- Linux (for native USB audio capture)

## Installation

```bash
# Clone and install
cd m8-display
npm install

# Build native audio capture tool (optional, for browser audio)
cd tools
gcc -o m8-audio-capture m8-audio-capture.c -lusb-1.0
cd ..
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

## API Reference

### REST Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Connection status |
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
| `/screen` | Binary | JPEG images (10 FPS) |
| `/audio` | Binary | PCM audio (S16_LE, 44100Hz, stereo) |
| `/display` | Binary | Raw SLIP frames (for m8c) |

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
├── serial/
│   ├── connection.ts  # M8 USB serial connection
│   ├── slip.ts        # SLIP protocol decoder
│   └── commands.ts    # M8 command parser
├── server/
│   ├── http.ts        # HTTP/WebSocket server
│   └── tcp-proxy.ts   # TCP proxy for m8c clients
├── display/
│   ├── framebuffer.ts # Pixel buffer + JPEG/BMP export
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

## Development

```bash
# Run with watch mode
npm run dev

# Run tests
npm test

# Run E2E tests
npm run test:e2e
```

## License

MIT

## Credits

- [Dirtywave M8](https://dirtywave.com/) - The amazing tracker
- [m8c](https://github.com/laamaa/m8c) - Original M8 headless client (protocol reference)
