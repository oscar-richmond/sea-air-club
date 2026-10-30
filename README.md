# Sea Air Club

Website for Sea Air Club: three cabins near Salcombe, Devon. Built with Astro 7, Tailwind CSS 4 and Vercel.

## Run it

```bash
pnpm install
cp .env.example .env
pnpm dev          # http://localhost:4321
pnpm build        # production build
pnpm test         # unit tests
pnpm test:e2e     # end-to-end tests (Playwright)
```

Requires Node 22.22 or newer (24 recommended, see `.nvmrc`).

## Docs

- [Architecture](docs/ARCHITECTURE.md): stack, structure, and how the site scales to bookings
- [Build plan](docs/PLAN.md): phases, workstreams and what's needed before go-live
- [Sign-ups runbook](docs/SIGNUPS.md): storage, CSV export and importing into ResNexus
- [Deploying](docs/DEPLOY.md): Vercel setup, environment variables and the domain
