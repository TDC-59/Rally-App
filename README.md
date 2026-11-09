# Rally

An operating system for food trucks. A restaurant's address is a constant; a truck's address is the product.

- Standing rules for anyone (human or agent) writing code here: [`CLAUDE.md`](CLAUDE.md)
- Domain glossary: [`CONTEXT.md`](CONTEXT.md)
- Decisions: [`docs/adr/`](docs/adr/)
- Current build plan: [`docs/plan/v1a-plan.md`](docs/plan/v1a-plan.md)

## Develop

```bash
npm install
npm test                 # vitest in the Workers runtime
npm run db:migrate:local
npm run dev
```

## Deploy

```bash
npm run db:migrate:remote
npm run deploy
```
