# Intune Settings Catalog Viewer

A fast, searchable viewer for the **Microsoft Intune Settings Catalog**, hosted on **GitHub Pages**. Gives IT admins a quicker way to browse all available settings without signing into the Intune portal — just open the site in any browser.

![Next.js](https://img.shields.io/badge/Next.js-14-black) ![TypeScript](https://img.shields.io/badge/TypeScript-5-blue) ![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-38bdf8) ![GitHub Pages](https://img.shields.io/badge/Hosted_on-GitHub_Pages-222) ![License](https://img.shields.io/badge/License-MIT-green)

## Live Site

The site is publicly available on GitHub Pages — no installation required:

> **https://lewis-barry.github.io/IntuneSettingsCatalogViewer/**

Data is refreshed automatically every day via GitHub Actions. Simply visit the URL to browse the latest Intune settings.

## Features

- **Browse by category** — hierarchical, collapsible category tree mirroring the Intune UI
- **Instant search** — Flexsearch-powered client-side search across 10,000+ settings with type-ahead results
- **Setting details** — description, help text, allowed values/options, CSP paths, constraints, keywords, documentation links
- **Scope badges** — Device vs User scope clearly indicated
- **Platform filtering** — filter by Windows, macOS, iOS, Android, Linux
- **Daily changelog** — automated diff showing additions, removals, and changes
- **Deep links** — every setting has its own shareable URL
- **Fully static** — zero runtime API calls; the entire site is pre-built and served from GitHub Pages
- **Daily auto-refresh** — GitHub Actions fetches fresh data from Microsoft Graph and redeploys every day

## How It Works

```
┌──────────────────┐     ┌────────────────────┐     ┌──────────────────┐
│  Microsoft Graph  │────▶│  GitHub Actions     │────▶│  GitHub Pages    │
│  (beta API)       │     │  (daily cron)       │     │  (static site)   │
└──────────────────┘     └────────────────────┘     └──────────────────┘
                          │                          
                          ├─ fetch-settings.ts       
                          ├─ generate-changelog.ts   
                          ├─ build-search-index.ts   
                          └─ next build (static)     
```

1. A **daily GitHub Actions workflow** authenticates to the Microsoft Graph beta API using an Azure AD app registration with `DeviceManagementConfiguration.Read.All`.
2. It fetches all setting definitions and categories, diffs them against the previous snapshot, and generates a changelog.
3. A Flexsearch index and category tree are built from the data.
4. Next.js produces a **fully static export** — pure HTML, CSS, and JS with no server required.
5. The static output is deployed to **GitHub Pages**, where it is publicly accessible.

End users just visit the URL; there is nothing to install or run.

## Project Structure

```
├── .github/workflows/
│   ├── refresh-and-deploy.yml   # Daily cron: fetch → diff → build → deploy to Pages
│   └── deploy-on-push.yml       # On push: build → deploy to Pages (uses existing data)
├── data/
│   ├── sample-categories.json   # Sample data for local development
│   ├── sample-settings.json     # Sample data for local development
│   ├── changelog.json           # Persisted changelog (committed to repo)
│   ├── categories.json          # Fetched categories (gitignored)
│   ├── settings.json            # Fetched settings (gitignored)
│   ├── settings-previous.json   # Previous snapshot for diffing (gitignored)
│   └── category-tree.json       # Computed tree structure (gitignored)
├── scripts/
│   ├── fetch-settings.ts        # Graph API data ingestion
│   ├── generate-changelog.ts    # Snapshot diff engine
│   ├── build-search-index.ts    # Flexsearch index + category tree builder
│   └── setup-dev-data.ts        # Copy sample data for local dev
├── src/
│   ├── app/
│   │   ├── layout.tsx           # Shell: header, nav, footer
│   │   ├── globals.css          # Tailwind + Fluent UI styles
│   │   ├── page.tsx             # Home: category browser + search
│   │   ├── changelog/page.tsx   # Changelog viewer
│   │   └── setting/[id]/page.tsx # Individual setting page
│   ├── components/
│   │   ├── CategoryTree.tsx     # Collapsible category sidebar
│   │   ├── SettingsCatalogBrowser.tsx # Main browser layout
│   │   ├── SettingsList.tsx      # Settings list with progressive loading
│   │   ├── SettingRow.tsx        # Individual setting row
│   │   ├── SettingDetail.tsx     # Expanded setting details
│   │   ├── SearchBar.tsx         # Flexsearch-powered search
│   │   ├── PlatformFilter.tsx    # Platform filter pills
│   │   └── ChangelogViewer.tsx   # Changelog display
│   └── lib/
│       ├── types.ts             # TypeScript types + helper functions
│       ├── data.ts              # Build-time data loading
│       └── search.ts            # Client-side Flexsearch wrapper
├── package.json
├── tsconfig.json
├── next.config.js
├── tailwind.config.js
└── postcss.config.js
```

## Configuration

- **Colors**: Edit `tailwind.config.js` → `theme.extend.colors.fluent`
- **Search fields/weights**: Edit `src/lib/search.ts` → Document index config

## API Details

This project uses the **Microsoft Graph beta API** (fetched during the GitHub Actions build, not at runtime):

| Endpoint | Purpose |
|---|---|
| `GET /beta/deviceManagement/configurationCategories` | Setting categories (hierarchy) |
| `GET /beta/deviceManagement/configurationSettings` | All setting definitions |

**Permission required**: `DeviceManagementConfiguration.Read.All` (Application)

> **Note**: These endpoints are beta-only. Microsoft supports beta APIs for Intune but they may change. The tenant requires an active Intune license. The site itself makes **no API calls** — all data is baked in at build time.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Use sample data for development (`npx tsx scripts/setup-dev-data.ts`)
4. Ensure the site builds cleanly (`npm run build`)
5. Submit a pull request

## License

MIT
