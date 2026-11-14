# Groundwork web app

See the [root README](../README.md) for the current product description, verified public-mode setup, model limits, data credits, and security notes. The two-minute walkthrough is in [docs/DEMO.md](../docs/DEMO.md).

## Commands

Run the public-data demo from this directory:

```sh
DATA_MODE=public npm run dev
```

Run the app checks and production build:

```sh
npm test
npm run typecheck
npm run lint
DATA_MODE=public npm run build
```

The public mode uses repository data and a process-local watchlist; it does not require database or sponsor credentials. Database-backed mode requires configuration and is not covered by the public demo instructions.
