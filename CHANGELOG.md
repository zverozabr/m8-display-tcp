# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-01-10

### Added
- Initial public release
- HTTP REST API for M8 control
- WebSocket streaming (display, audio, control)
- Native USB audio capture via libusb
- TCP proxy for remote m8c clients
- Browser UI at http://localhost:8080
- Docker support with USB passthrough
- PROTOCOL.md - first M8 TCP protocol specification
- Setup CLI for system diagnostics (`npm run setup`)

### Features
- **Display**: Real-time BMP streaming at 10 FPS
- **Audio**: Direct USB capture, bypasses ALSA/PipeWire
- **Input**: REST API + WebSocket for low-latency control
- **TCP Proxy**: Connect native m8c clients over network
- **State Tracking**: OCR-based cursor position detection

### Technical
- TypeScript with strict mode
- SOLID architecture with dependency injection
- 234 unit tests, 7 e2e tests
- Delta encoding for bandwidth optimization
- Multi-stage Docker build

## [Unreleased]

### Planned
- Refactor http.ts into smaller modules
- Add state tracker tests
- Add USB reset tests
