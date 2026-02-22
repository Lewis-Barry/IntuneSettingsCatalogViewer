# Intune Settings Catalog Viewer

A fast, searchable reference for the **Microsoft Intune Settings Catalog** — browse every available setting across all platforms without signing into the Intune portal. Just open the site in any browser.

Built with Next.js, TypeScript, and Tailwind CSS. Data is pulled daily from the Microsoft Graph API by GitHub Actions, statically rendered, and deployed to GitHub Pages. The site makes **zero runtime API calls** — everything is baked in at build time.

![Next.js](https://img.shields.io/badge/Next.js-14-black) ![TypeScript](https://img.shields.io/badge/TypeScript-5-blue) ![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-38bdf8) ![GitHub Pages](https://img.shields.io/badge/Hosted_on-GitHub_Pages-222) ![License](https://img.shields.io/badge/License-GPL--3.0-blue)

## Live Site

> **https://intunesettings.app**

No installation, no sign-in. Data is refreshed automatically every day.

---

## Features

### Browse by Category

- Full hierarchical category tree mirroring the Intune admin center, with expand/collapse and setting counts per category
- Selecting a category shows all settings within it and its descendants
- Platform filter dynamically prunes the tree — categories with zero matching settings disappear and counts update
- Keyboard navigable (Arrow keys to expand/collapse, Enter to select)
- On mobile the tree becomes a slide-out drawer triggered by a floating action button

### Search

- **Client-side full-text search** powered by FlexSearch across 10,000+ settings — no server round-trips
- Indexed fields ranked by relevance: display name, keywords, description, category name, and CSP path
- **Comma-separated multi-term** queries (matches Intune's native search behavior)
- Results grouped by category with breadcrumb ancestry paths, sorted by best match
- **Match-source highlighting**: yellow highlight when the query matches the title; blue highlight for description/CSP/keyword-only matches, with an amber left border to call out settings that matched outside the title
- Lazy-loaded search index (fetched on first focus, not on page load)
- Debounced input with loading indicator

### Platform Filtering

- Toggle between **All**, **Windows**, **macOS**, **iOS/iPadOS**, **Android**, and **Linux**
- Filters apply everywhere — category tree, setting lists, and search results
- Custom SVG platform icons matching the Intune admin center

### Setting Details

- **Inline expand**: click any row to see description, allowed values/options, default value, CSP path, platform, and technology
- **Dedicated setting page** (`/setting/{id}/`) with full breadcrumb navigation, child settings, and SEO metadata
- **Scope badges**: Device (blue) or User (green), derived from the base URI
- **Type badges**: Choice, Simple, Group, Collection, Redirect, and more
- **Parent/child relationships**: child settings nested with tree connectors and indentation; collection items grouped under their parent
- **Disambiguation labels**: when multiple settings share the same name, the source sub-category is shown
- **ASR (Attack Surface Reduction) rules**: inline rule name, well-known GUID, notes, and a direct link to the Microsoft Learn reference page

### Changelog

- **Daily automated diff** comparing setting snapshots — tracks additions, removals, and field-level changes
- Stats dashboard showing last change date, total additions, removals, and modifications
- Filter tabs: All / Added / Removed / Changed
- Collapsible date entries with summary badges (+N, −N, ~N)
- Changed settings show field-level old → new diffs
- Added/removed settings link to their detail pages

### Deep Links & SEO

- Every setting and every category has its own permanent, shareable URL
- Dynamic `<meta>` tags and page titles generated per setting and category at build time

### Performance

- **Fully static site** — pre-rendered at build time with Next.js SSG, zero runtime API calls
- Virtualized setting lists using `@tanstack/react-virtual` for smooth scrolling through thousands of rows
- Progressive loading (500-setting pages with "Show more")
- Memoized components to minimise re-renders

### Responsive & Mobile-First

- Adaptive layout with desktop sidebar and mobile slide-out drawer
- Resizable sidebar on desktop (drag handle, 200–600 px)
- Enlarged touch targets on coarse-pointer devices
- Mobile-aware header, nav, and badge layout
- Dynamic viewport height (`dvh`) for correct sizing with mobile browser chrome

### Accessibility

- ARIA tree roles, `aria-expanded`, `aria-selected`, screen-reader labels
- Keyboard navigation throughout (categories, settings, search)
- Semantic HTML (`<nav>`, `<main>`, `<header>`, `<footer>`, `<details>`)
- Focus-visible rings matching Fluent design tokens

---

## How It Works

```
┌──────────────────┐     ┌────────────────────┐     ┌──────────────────┐
│  Microsoft Graph  │────▶│  GitHub Actions     │────▶│  GitHub Pages    │
│  (beta API)       │     │  (daily @ 06:00 UTC)│     │  (static site)   │
└──────────────────┘     └────────────────────┘     └──────────────────┘
                          │
                          ├─ fetch-settings.ts
                          ├─ generate-changelog.ts
                          ├─ build-search-index.ts
                          └─ next build (static export)
```

1. A **daily GitHub Actions workflow** authenticates to the Microsoft Graph beta API using an Azure AD app registration with `DeviceManagementConfiguration.Read.All`.
2. It fetches all setting definitions and categories, diffs them against the previous snapshot, and generates a changelog.
3. A FlexSearch index and category tree are built from the data.
4. Next.js produces a fully static export — pure HTML, CSS, and JS.
5. The output is deployed to GitHub Pages.

## API Details

This project uses the **Microsoft Graph beta API** (fetched during the build, not at runtime):

| Endpoint | Purpose |
|---|---|
| `GET /beta/deviceManagement/configurationCategories` | Setting categories (hierarchy) |
| `GET /beta/deviceManagement/configurationSettings` | All setting definitions |

**Permission required**: `DeviceManagementConfiguration.Read.All` (Application)

> These endpoints are beta-only. The tenant requires an active Intune license. The live site makes **no API calls** — all data is baked in at build time.

## License

[GPL-3.0](LICENSE)
