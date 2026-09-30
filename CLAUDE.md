Update this file as you add/change/remove relevant features

# Intune Settings Catalog Viewer

Static Next.js 14 (App Router) + TypeScript + TailwindCSS app. Deployed to GitHub Pages via `output: 'export'`. Zero runtime API calls — all data is baked in at build time.

## Architecture

**Data pipeline → static files → Next.js static export → GitHub Pages**

### Data Flow
1. `scripts/fetch-settings.ts` — authenticates with Azure AD, fetches the Intune Settings Catalog via MS Graph API → `data/settings.json` (~62MB), `data/categories.json`. Pulls **two catalogs** in one loop (`CATALOGS`): `configurationCategories`/`configurationSettings` and `complianceCategories`/`complianceSettings`. Both are the same Graph resource types under the same permission scope, so everything downstream is shared; records are deduped by id and each carries its own `settingUsage`.
   - **Scope note:** `complianceSettings` backs the *settings-catalog-style* compliance engine (`deviceManagement/compliancePolicies`). The **classic** compliance policies (`deviceManagement/deviceCompliancePolicies`, e.g. `windows10CompliancePolicy`) are typed resources with fixed properties — `storageRequireEncryption`, `tpmRequired`, `defenderEnabled` etc. — and have **no setting definitions in any catalog**, so they cannot appear here.
2. `scripts/build-search-index.ts` — reads settings.json → generates `public/search-index.json`, `data/category-tree.json`, `public/settings-by-category/{id}.json` shards, `data/catalog-stats.json` (now `{ totalSettings, byUsage }`). `settingUsage` is emitted on index/browse records **only when it isn't plain `configuration`** — that default is ~95% of the catalog and spelling it out everywhere would add ~600KB; readers treat a missing value as configuration. The two Windows SKU reports stay configuration-only.
3. `scripts/fetch-oib-data.ts` — fetches OpenIntuneBaseline policies from GitHub → `public/oib-data.json` (current snapshot for `/baseline`) **and** per-release-tag shards `public/oib-versions/<tag>.json` + `index.json` (powers the version diff at `/baseline/changelog`)
4. `scripts/generate-changelog.ts` — diffs current vs previous snapshot → `data/changelog.json` (CI copies the committed `settings.json`/`categories.json` to `*-previous.json` before fetching; the `-previous` files are not committed)
5. `scripts/fetch-baselines.ts` — fetches Microsoft's Intune security baseline templates from Graph beta (`templateFamily eq 'baseline'`, works with zero baselines configured; STIG audit-only templates excluded — not shown in the Intune portal), resolves setting/option/category names from `data/settings.json` → `public/baselines/index.json` (families by baseId) + one shard per version `public/baselines/{id}.json`
6. `scripts/fetch-compliance-templates.ts` — the **classic** compliance policies (`deviceManagement/deviceCompliancePolicies`) are typed Graph resources with fixed properties and **no definition endpoint**, so their catalog is reconstructed from two sources: Graph `$metadata` (types, properties, and **enum members = the possible values**) + Microsoft's doc source on GitHub (each property's description). Nothing is hand-written except the type-to-platform label map, so it regenerates as Microsoft adds settings. Needs **no credentials and reads no tenant data** — a reference catalog of what *can* be set, never what a tenant *has* set. -> `data/compliance-templates.json` (11 platforms, 242 settings, 88 distinct). Written to `data/`, not `public/`, so the page loads it at build time as a server-component prop — that is what makes it server-render its full chrome like the main browser instead of flashing a loading state.
   - **Parsing gotcha:** ~240 EntityTypes in `$metadata` are self-closing, so a non-greedy `<EntityType ...>(...)</EntityType>` match silently spans across them and swallows real types (including `windows10CompliancePolicy`). Split on the open tag instead.
7. Next.js static generation reads from `data/` at build time; browser fetches from `public/` at runtime

### Key Source Files

| File | Role |
|------|------|
| `src/app/page.tsx` | Main settings browser — loads category-tree + stats at build time |
| `src/app/category/` | Per-category pages (lazy-loaded shards) |
| `src/app/setting/` | Individual setting detail pages (slug-based) |
| `src/app/changelog/` | Changelog viewer |
| `src/app/compliance/` + `src/components/ComplianceBrowser.tsx` | Compliance settings browser. Deliberately shares the main browser's chrome so the two pages read as one site: same `max-w-[1600px]` wrapper, `h-[calc(100dvh-…)]` shell, header/search/platform-filter block, `BrowserSidebar`, and the same `category-item` / `setting-row` / `scope-badge` / `info-icon` CSS classes and `w-[4.5rem]`/`w-[6rem]`/`w-[3.5rem]` column widths. Rows expand to Description / **Possible values** / Graph property. Shows only what *can* be configured; never tenant values |
| `src/lib/compliance-types.ts` | Classic compliance types + `humanise()`/`typeLabel()`/`matchesQuery()`. Self-check: `npm run check-compliance` |
| `src/app/baseline/` | OpenIntuneBaseline (OIB) policy browser |
| `src/app/baseline/changelog/` | OIB Changelog — compare any two OIB versions (grouped under "OIB Lookup" hover menu in nav) |
| `src/app/baselines/` | Microsoft Security Baselines browser — family + version pickers, search, CSV/HTML export (grouped under "MS Baselines" hover menu in nav) |
| `src/app/baselines/changelog/` | Security Baseline Changelog — compare any two versions of one baseline family |
| `src/components/SettingsCatalogBrowser.tsx` | Main container component. Browses the **whole** settings catalog (configuration + compliance, 18,342 settings) with no catalog filter — the classic compliance settings live on their own `/compliance` page instead |
| `src/components/SettingsList.tsx` | Virtualized list (@tanstack/react-virtual) |
| `src/components/SearchBar.tsx` | Delegates queries to Web Worker |
| `src/components/CategoryTree.tsx` | Hierarchical sidebar |
| `src/components/OIBBrowser.tsx` | OIB policy browser — fetches `public/oib-data.json` at runtime, cross-references settings catalog; Export dropdown (CSV/HTML) via `oib-browse-export.ts` |
| `src/components/OIBChangelogViewer.tsx` | OIB Changelog UI — version pickers, fetches two shards, diffs client-side via `oib-diff.ts`; reuses `SettingRow` for drilldowns; Export dropdown (CSV/HTML) |
| `src/lib/search.ts` + `search.worker.ts` | Flexsearch index loaded/queried in Web Worker |
| `src/lib/data.ts` | Build-time JSON loaders with module-level caching |
| `src/lib/types.ts` | Shared TypeScript types + `hasUsage()` — `settingUsage` is a comma-separated **flag set** (`configuration`, `compliance`, `configuration,compliance`, `configuration,reusableSetting`), so catalog membership is a flag test, never an equality check. Used at build time only, to keep the Windows SKU reports configuration-only. Self-check: `npm run check-usage-filter` |
| `src/lib/oib-types.ts` | OIB-specific types and helpers |
| `src/components/BaselineBrowser.tsx` | MS Security Baselines browse UI — mirrors `OIBBrowser`: family/version dropdowns, `BrowserSidebar` category tree, cross-baseline search over active versions, `SettingRow` rows (baseline default highlighted), CSV/HTML export |
| `src/components/BaselineChangelogViewer.tsx` | MS Security Baseline version compare — mirrors `OIBChangelogViewer`: base/compare selects + swap, stat-tile filters, category-grouped sections with sticky headers, `SettingRow` drilldowns, CSV/HTML export |
| `src/components/VersionDiffView.tsx` | Shared shell for both version-compare pages (pickers + swap, stat-tile filters, search toolbar, `CategorySection`, `ChangeCard`, `ChangeBadge`, `useDiffView` state hook). Each viewer keeps its own loading, diffing and value formatting |
| `src/components/BrowserParts.tsx` | Shared pieces of the OIB + MS baseline browsers: `FolderSidebarTree`, `SectionHeader`, `BrowserHeader`, `BrowserSearchBar`, loading/empty/error panels |
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

### MCP server (`mcp/`)

Standalone stdio MCP server (own `package.json`; excluded from the Next build via root `tsconfig.json`/`eslint.config.mjs`). Reads this repo's committed data files from GitHub raw (`INTUNE_MCP_REPO`/`INTUNE_MCP_REF`, default `Lewis-Barry/IntuneSettingsCatalogViewer@main`), in memory only, ETag-revalidated after 6 h. Published to npm as `intune-settings-catalog-viewer-mcp` (esbuild bundle `mcp/dist/server.js`, because it bundles `../src/lib`); install instructions for users live on the `/mcp/` page and in `mcp/README.md` — keep the two in sync. Releases are automatic via `.github/workflows/publish-mcp.yml` (on `mcp/**`/`src/lib/**` changes; publishes a patch only when the rebuilt bundle differs from npm's; needs secret `NPM_TOKEN`).

| File | Role |
|------|------|
| `mcp/source.ts` | GitHub raw fetch + in-memory memo + ETag revalidation + stale fallback |
| `mcp/data.ts` | Typed loaders + memoised indexes for every dataset (the MCP's counterpart of `src/lib/data.ts`) |
| `mcp/format.ts` | Shared output helpers: footer, limits, platform filter, labels |
| `mcp/tools/*.ts` | 11 read-only tools (settings, changelog, baselines, oib, extras); each exports `register` + `selfCheck` |
| `mcp/check.ts` | Self-check (`cd mcp && npm run check`, needs network) |
| `src/app/mcp/` + `src/components/McpInstallGuide.tsx` | "MCP" nav page: per-client install steps (Claude Desktop, Claude Code, VS Code/Cursor one-click links, Codex), copy buttons, example questions |

Reuses `src/lib` read-only (types, `baseline-diff`, `oib-diff`, `compliance-types`, `sku-labels`, `slug`, `settings-grouping`) — keep those files free of browser/React imports. Never write to stdout in server code (it's the MCP channel).

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
npm run check-usage-filter   # Self-check for the configuration/compliance catalog filter (settingUsage flag parsing)
npm run fetch-compliance-templates  # Rebuild the classic compliance catalog (no credentials needed)
npm run check-compliance     # Self-check for the classic compliance catalog (parsing, enum values, no tenant data)
cd mcp && npm install && npm run check   # MCP server self-check (reads live data from GitHub raw)
```

## Env Vars
- Data refresh: `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`
- OIB fetch (optional): `GITHUB_TOKEN` — raises GitHub API rate limit from 60/hr to 5,000/hr
