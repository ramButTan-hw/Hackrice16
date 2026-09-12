# Hackrice16

The frontend is a minimal smoked-green glass session panel. Use the top-right
collapse button to shrink Electron into a compact timer pill; expand restores the
session view. Drag the empty header area to move the window. Pinning is optional and off
by default. Session start/end and history use the existing backend; no camera
readings or AI messages are fabricated. Active sessions restore on reopening.

Database/state/analytics setup and teammate contracts: [Data handoff](docs/DATA_HANDOFF.md).
Run `npm test` for backend checks and `npm run demo:data` for a complete simulated session export.

React + Vite frontend, Electron desktop shell, and an Express API on Node.js.

## Requirements

Node.js 22.12 or newer and npm.

## Start developing

~~~sh
npm install
npm run dev
~~~

This starts the Node API on http://127.0.0.1:3001, Vite on
http://127.0.0.1:5173, and the Electron window. React updates automatically;
the API restarts when its files change. Restart npm run dev after editing
Electron code. Closing Electron stops the development processes.

## Commands

- npm run dev: start the full desktop development environment.
- npm run dev:web: start only Vite; run npm run dev:server separately for API access.
- npm run dev:server: run the API with Node's file watcher.
- npm run build: build React into dist.
- npm start: build React and open Electron with an embedded Node server.
- npm run server: serve the API and an existing dist build on port 3001.
- npm run preview: preview the frontend build; requires the API separately.

Set PORT to override the standalone API port. The Vite proxy and development
startup use port 3001 by default; update them if changing PORT.
The production desktop server chooses an available loopback port automatically.

## Project layout

- src/: React components and styles.
- electron/main.cjs: Electron lifecycle and desktop window.
- server/app.js: shared API routes and static frontend hosting.
- server/index.js: standalone Node API entry point.
- vite.config.js: frontend development server and API proxy.

The renderer uses sandboxing and context isolation with Node integration disabled.
Add server endpoints for backend work; do not expose unrestricted Node access
to the renderer. Installer packaging and code signing are not configured.
