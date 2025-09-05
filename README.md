# Holophonix Processor – Bitfocus Companion Module

This is a scaffolding module combining WebSocket and OSC capabilities, tailored for Holophonix Processor integrations.

- WebSocket client with reconnect and variable updates from JSON paths
- OSC UDP send + optional UDP listen for feedback
- A small set of generic actions and feedbacks to get started

## Usage

1. Add an instance of this module in Companion.
2. Configure both transports as needed in the config panel:
   - WebSocket URL (e.g. `ws://host:port/path`)
   - OSC target host/port, optional feedback listen port
3. Use the provided actions to send WebSocket or OSC messages.
4. Add feedbacks/variables based on incoming messages.

## Development

- Main entry: `main.js`
- Upgrade scripts: `upgrade.js`
- Formatting: `prettier` via `@companion-module/tools`

Install dev deps and format:

```bash
yarn install
yarn format
```

## License

MIT
