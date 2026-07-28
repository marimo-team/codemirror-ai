# codemirror-ai

CodeMirror 6 extension for AI-assisted inline editing and next-edit prediction (Cursor/Continue-style). Published to npm as `@marimo-team/codemirror-ai` and used by marimo's editor.

## Development

```bash
pnpm install --ignore-scripts --frozen-lockfile  # CI install
pnpm test              # vitest
pnpm run lint          # biome check --write (autofix.ci runs this on PRs)
pnpm exec biome ci .   # non-mutating lint CI enforces
pnpm run typecheck     # tsc --noEmit
pnpm run demo          # vite build of demo/
pnpm run dev           # vite dev server
```

- Release: `pnpm run release` (pnpm version) bumps + tags; pushing a `v*` tag triggers release.yml, which publishes to npm via OIDC.
