# iobroker.faut

iobroker Adapter using an admin React Interface

## Development

### Architecture

The adapter consists of two parts:

- **Adapter backend** (`src/`): TypeScript, compiled to `build/` via `tsc`
- **Admin frontend** (`src-admin/`): React app, built via Vite, output copied to `admin/`

The admin frontend is a **separate npm project** inside `src-admin/` with its own `node_modules`.
This mirrors the pattern used by `iobroker.iot` and is required to avoid dependency conflicts.

### Build Steps

#### First-time setup

```bash
# 1. Install root dependencies (includes @iobroker/build-tools)
npm install

# 2. Install admin frontend dependencies (MUI v6, adapter-react-v5 v8, Vite)
cd src-admin && npm install && cd ..
```

#### Build adapter backend (TypeScript)

```bash
npm run build:ts
```

#### Build admin frontend

```bash
# Full build (Vite) + copy output to admin/
npm run build:admin

# Or manually:
cd src-admin && npx vite build && cd ..
node tasks --copy-admin
```

#### Full build (backend + frontend)

```bash
npm run build
```

### Notes & Quirks

- **Node.js v24 + Windows**: `@iobroker/adapter-dev` is not used because its bundled `esbuild`
  binary is incompatible with Node.js v24 on Windows (EFTYPE error). The adapter backend uses
  `tsc` directly, and the admin uses Vite.

- **Separate `src-admin/` project**: The admin frontend has its own `package.json` and
  `node_modules`. You must run `npm install` inside `src-admin/` before building.
  `src-admin/node_modules` is excluded from git.

- **socket.io loading**: `src-admin/index.html` loads socket.io dynamically at runtime.
  During dev (port 3000) it loads from `http://localhost:8081/lib/js/socket.io.js`.
  The production build uses `../../lib/js/socket.io.js` (relative to the ioBroker admin URL
  `/adapter/faut/index_m.html`). The `tasks.js` copy step handles this via `patchHtmlFile`
  from `@iobroker/build-tools`.

- **`src-admin/build/` is committed**: The built frontend assets are committed to git so that
  ioBroker can install the adapter directly from GitHub without a build step.

- **Tech stack**: `@iobroker/adapter-react-v5` v8, MUI v6, `@emotion/react`, Vite v6,
  `@mui/x-tree-view` v7 (`SimpleTreeView`).

### Install from GitHub (development)

In ioBroker admin, use the "Install from URL" option:

```
github:NewXtSI/iobroker.faut
```
