# Intune Settings Catalog Viewer

Static Next.js 14 (App Router) + TypeScript + TailwindCSS app. Deployed to GitHub Pages via `output: 'export'`. Zero runtime API calls — all data is baked in at build time.

## Architecture

**Data pipeline → static files → Next.js static export → GitHub Pages**

### Data Flow
1. `scripts/fetch-settings.ts` — authenticates with Azure AD, fetches full Intune Settings Catalog via MS Graph API → `data/settings.json` (~62MB), `data/categories.json`
2. `scripts/build-search-index.ts` — reads settings.json → generates `public/search-index.json`, `data/category-tree.json`, `public/settings-by-category/{id}.json` shards, `data/catalog-stats.json`
3. `scripts/fetch-oib-data.ts` — fetches OpenIntuneBaseline policies from GitHub → `public/oib-data.json` (current snapshot for `/baseline`) **and** per-release-tag shards `public/oib-versions/<tag>.json` + `index.json` (powers the version diff at `/baseline/changelog`)
4. `scripts/generate-changelog.ts` — diffs current vs previous snapshot → `data/changelog.json`
4. Next.js static generation reads from `data/` at build time; browser fetches from `public/` at runtime

### Key Source Files

| File | Role |
|------|------|
| `src/app/page.tsx` | Main settings browser — loads category-tree + stats at build time |
| `src/app/category/` | Per-category pages (lazy-loaded shards) |
| `src/app/setting/` | Individual setting detail pages (slug-based) |
| `src/app/changelog/` | Changelog viewer |
| `src/app/baseline/` | OpenIntuneBaseline (OIB) policy browser |
| `src/app/baseline/changelog/` | Baseline Diff — compare any two OIB versions |
| `src/components/SettingsCatalogBrowser.tsx` | Main container component |
| `src/components/SettingsList.tsx` | Virtualized list (@tanstack/react-virtual) |
| `src/components/SearchBar.tsx` | Delegates queries to Web Worker |
| `src/components/CategoryTree.tsx` | Hierarchical sidebar |
| `src/components/OIBBrowser.tsx` | OIB policy browser — fetches `public/oib-data.json` at runtime, cross-references settings catalog |
| `src/components/OIBChangelogViewer.tsx` | Baseline Diff UI — version pickers, fetches two shards, diffs client-side via `oib-diff.ts` |
| `src/lib/search.ts` + `search.worker.ts` | Flexsearch index loaded/queried in Web Worker |
| `src/lib/data.ts` | Build-time JSON loaders with module-level caching |
| `src/lib/types.ts` | Shared TypeScript types |
| `src/lib/oib-types.ts` | OIB-specific types and helpers |
| `src/lib/oib-diff.ts` | Version diff engine — 3-tier policy matching (oibId → title → fuzzy) + setting compare; shared by browser & `scripts/oib-diff-check.ts` |
| `src/lib/slug.ts` | URL slug generation |

### Performance
- Web Worker search (Flexsearch off main thread)
- Virtual scrolling for large lists
- Per-category JSON shards (lazy-loaded, not the full 62MB)
- Module-level JSON caching during static generation

## Dev Commands

```bash
npm run dev                  # Start dev server
npm run build                # Static export to out/
npm run build-search-index   # Regenerate search index + shards from data/settings.json
npm run refresh              # Full data refresh (requires Azure credentials in env)
```

## Env Vars (for data refresh only)
`AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`
