# Contributing to m8-display

Thank you for your interest in contributing to m8-display!

## Development Setup

```bash
# Clone the repository
git clone https://github.com/zverozabr/m8-display-tcp.git
cd m8-display

# Install dependencies
npm install

# Run diagnostics to check your setup
npm run setup

# Start development server with hot reload
npm run dev
```

## Running Tests

```bash
# Unit tests (uses bun:test)
npm test

# E2E tests (uses Playwright)
npm run test:e2e

# All tests
npm test && npm run test:e2e
```

## Project Structure

```
src/
├── audio/      # USB audio capture and streaming
├── display/    # Framebuffer and text rendering
├── serial/     # M8 serial protocol (SLIP encoding)
├── server/     # HTTP API and WebSocket handlers
├── state/      # M8 state tracking (screen, cursor)
└── index.ts    # Entry point
```

## Code Style

- TypeScript strict mode enabled
- ES modules (type: module)
- Prefer `const` over `let`
- Use async/await instead of callbacks
- Follow existing naming conventions

## Pull Request Guidelines

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes
4. Run tests: `npm test`
5. Commit with descriptive message
6. Push to your fork
7. Open a Pull Request

## Reporting Issues

When reporting issues, please include:

- M8 firmware version
- Operating system
- Node.js version (`node --version`)
- Steps to reproduce
- Error messages or logs

## Questions?

Feel free to open an issue for questions or join the M8 community discussions.
