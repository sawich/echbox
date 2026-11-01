# backend

Elysia API on Bun. Shared Zod schemas come from `@echbox/shared`.

```bash
bun run dev
```

Default port: `3001` (`PORT` env overrides).

## Seed scenes

Seed scenes are no longer served from fixtures. After deploying, migrate the DB, then import them:

```bash
bun run db:migrate        # apply migrations
bun run scenes:import-seed
```

`scenes:import-seed` populates the seed scenes as the `echbox` user. It is idempotent, so re-running it is safe. Until it runs, `/scenes` is empty.
