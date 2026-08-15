Update this file as you add/change/remove relevant features

# Intune Settings Catalog Viewer

Static Next.js 14 (App Router) + TypeScript + TailwindCSS app. Deployed to GitHub Pages via `output: 'export'`. Zero runtime API calls — all data is baked in at build time.

## Architecture

**Data pipeline → static files → Next.js static export → GitHub Pages**

### Data Flow
1. `scripts/fetch-settings.ts` — authenticates with Azure AD, fetches full Intune Settings Catalog via MS Graph API → `data/settings.json` (~62MB), `data/categories.json`
2. `scripts/build-search-index.ts` — reads settings.json → generates `public/search-index.json`, `data/category-tree.json`, `public/settings-by-category/{id}.json` shards, `data/catalog-stats.json`
3. `scripts/fetch-oib-data.ts` — fetches OpenIntuneBaseline policies from GitHub → `public/oib-data.json` (current snapshot for `/baseline`) **and** per-release-tag shards `public/oib-versions/<tag>.json` + `index.json` (powers the version diff at `/baseline/changelog`)
4. `scripts/generate-changelog.ts` — diffs current vs previous snapshot → `data/changelog.json`
5. `scripts/fetch-baselines.ts` — fetches Microsoft's Intune security baseline templates from Graph beta (`templateFamily eq 'baseline'`, works with zero baselines configured; STIG audit-only templates excluded — not shown in the Intune portal), resolves setting/option/category names from `data/settings.json` → `public/baselines/index.json` (families by baseId) + one shard per version `public/baselines/{id}.json`
6. Next.js static generation reads from `data/` at build time; browser fetches from `public/` at runtime

### Key Source Files

| File | Role |
|------|------|
| `src/app/page.tsx` | Main settings browser — loads category-tree + stats at build time |
| `src/app/category/` | Per-category pages (lazy-loaded shards) |
| `src/app/setting/` | Individual setting detail pages (slug-based) |
| `src/app/changelog/` | Changelog viewer |
| `src/app/baseline/` | OpenIntuneBaseline (OIB) policy browser |
| `src/app/baseline/changelog/` | OIB Changelog — compare any two OIB versions (grouped under "OIB Lookup" hover menu in nav) |
| `src/app/baselines/` | Microsoft Security Baselines browser — family + version pickers, search, CSV/HTML export (grouped under "MS Baselines" hover menu in nav) |
| `src/app/baselines/changelog/` | Security Baseline Changelog — compare any two versions of one baseline family |
| `src/components/SettingsCatalogBrowser.tsx` | Main container component |
| `src/components/SettingsList.tsx` | Virtualized list (@tanstack/react-virtual) |
| `src/components/SearchBar.tsx` | Delegates queries to Web Worker |
| `src/components/CategoryTree.tsx` | Hierarchical sidebar |
| `src/components/OIBBrowser.tsx` | OIB policy browser — fetches `public/oib-data.json` at runtime, cross-references settings catalog; Export dropdown (CSV/HTML) via `oib-browse-export.ts` |
| `src/components/OIBChangelogViewer.tsx` | OIB Changelog UI — version pickers, fetches two shards, diffs client-side via `oib-diff.ts`; reuses `SettingRow` for drilldowns; Export dropdown (CSV/HTML) |
| `src/lib/search.ts` + `search.worker.ts` | Flexsearch index loaded/queried in Web Worker |
| `src/lib/data.ts` | Build-time JSON loaders with module-level caching |
| `src/lib/types.ts` | Shared TypeScript types |
| `src/lib/oib-types.ts` | OIB-specific types and helpers |
| `src/components/BaselineBrowser.tsx` | MS Security Baselines browse UI — mirrors `OIBBrowser`: family/version dropdowns, `BrowserSidebar` category tree, cross-baseline search over active versions, `SettingRow` rows (baseline default highlighted), CSV/HTML export |
| `src/components/BaselineChangelogViewer.tsx` | MS Security Baseline version compare — mirrors `OIBChangelogViewer`: base/compare selects + swap, stat-tile filters, category-grouped sections with sticky headers, `SettingRow` drilldowns, CSV/HTML export |
| `src/lib/baseline-types.ts` | MS baseline types (index/shard/setting) + helpers, mirrors fetch-baselines.ts output |
| `src/lib/baseline-diff.ts` | Baseline version diff — keyed on settingDefinitionId, recursive value compare (template-id noise already stripped at fetch); self-check in `scripts/baseline-diff-check.ts` |
| `src/lib/baseline-export.ts` | CSV/HTML exports for both baseline pages, reuses OIB export plumbing |
| `src/lib/oib-diff.ts` | Version diff engine — 3-tier policy matching (oibId → title → fuzzy) + setting compare; shared by browser & `scripts/oib-diff-check.ts` |
| `src/lib/oib-changelog-types.ts` | Types for the version index, shards, and diff records (`VersionDiff`/`PolicyDiff`/`SettingChange`) |
| `src/lib/oib-export-shared.ts` | Shared plain-text export helpers (`fmtValue`, `settingName`, `kindWord`, `policyDisplayName`) used by both exporters |
| `src/lib/oib-html-export.ts` | Renders a comparison as a self-contained styled HTML report |
| `src/lib/oib-csv-export.ts` | Renders a comparison as CSV (one row per setting change), same content as the HTML report |
| `src/lib/oib-browse-export.ts` | Exports the OIB browse view (policies + configured settings, no change columns) as CSV or styled HTML; reuses `fmtValue` + the HTML `STYLE`/escape helpers. Respects the active platform/category/search filter |
| `src/lib/pill.ts` | Shared segmented-pill class helper (platform filter + version picker) |
| `src/lib/basePath.ts` | Next.js `basePath` constant (build-time inlined) — prefix for all runtime fetches of `public/` assets |
| `src/lib/slug.ts` | URL slug generation |

### Performance
- Web Worker search (Flexsearch off main thread)
- Virtual scrolling for large lists
- Per-category JSON shards (lazy-loaded, not the full 62MB)
- Module-level JSON caching during static generation
- Indexed lookups in `data.ts` (`getSettingBySlug`/`getChildSettings`/`getCategoryById`) — built once, so generating the ~17.7k setting pages is O(n), not O(n²)
- CI caches `.next/cache` between runs (compile/bundle reuse)

## Dev Commands

```bash
npm run dev                  # Start dev server
npm run build                # Static export to out/
npm run build-search-index   # Regenerate search index + shards from data/settings.json
npm run refresh              # Full data refresh (requires Azure credentials in env)
npm run fetch-oib            # Refresh OIB data: current snapshot + per-version shards (run on new OIB release)
npm run check-oib-diff       # Self-check for the OIB version diff engine (src/lib/oib-diff.ts)
npm run fetch-baselines      # Refresh MS security baseline data (requires Azure credentials in env)
npm run check-baseline-diff  # Self-check for the baseline diff engine (needs fetched baseline data)
npm run check-changelog-export  # Self-check for the changelog CSV/HTML exporters (src/lib/changelog-export.ts)
```

## Env Vars
- Data refresh: `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`
- OIB fetch (optional): `GITHUB_TOKEN` — raises GitHub API rate limit from 60/hr to 5,000/hr
