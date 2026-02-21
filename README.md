# Intune Settings Catalog Viewer

A fast, searchable, offline-capable viewer for the **Microsoft Intune Settings Catalog**. Gives IT admins a quicker way to browse all available settings without signing into the Intune portal.

![Next.js](https://img.shields.io/badge/Next.js-14-black) ![TypeScript](https://img.shields.io/badge/TypeScript-5-blue) ![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-38bdf8) ![License](https://img.shields.io/badge/License-MIT-green)

## Features

- **Browse by category** — hierarchical, collapsible category tree mirroring the Intune UI
- **Instant search** — Flexsearch-powered client-side search across 10,000+ settings with type-ahead results
- **Setting details** — description, help text, allowed values/options, CSP paths, constraints, keywords, documentation links
- **Scope badges** — Device vs User scope clearly indicated
- **Platform filtering** — filter by Windows, macOS, iOS, Android, Linux
- **Daily changelog** — automated diff showing additions, removals, and changes
- **Deep links** — every setting has its own shareable URL
- **Static site** — zero runtime API calls, deployed to GitHub Pages
- **Daily auto-refresh** — GitHub Actions fetches fresh data from Microsoft Graph daily

## Architecture

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

**Data pipeline**: An Azure AD app registration with `DeviceManagementConfiguration.Read.All` reads all setting definitions from the Graph beta API → diffs against the previous snapshot → generates a changelog → builds a Flexsearch index → Next.js static export → deployed to GitHub Pages.

## Prerequisites

- **Node.js 20+** and npm
- An **Azure AD (Entra ID) app registration** with access to an Intune-licensed tenant (for live data)
- **GitHub repository** with Pages enabled (for deployment)

## Quick Start (Local Development with Sample Data)

```bash
# 1. Install dependencies
npm install

# 2. Copy sample data files for local development
npx tsx scripts/setup-dev-data.ts

# 3. Build the search index and category tree
npx tsx scripts/build-search-index.ts

# 4. Start the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the site with sample data.

## Setup for Live Data

### Step 1: Create Azure AD App Registration

1. Go to [Microsoft Entra admin center](https://entra.microsoft.com) → **App registrations** → **New registration**
2. Name: `Intune Settings Catalog Reader` (or similar)
3. Supported account types: **Single tenant**
4. Click **Register**

### Step 2: Add API Permissions

1. Go to **API permissions** → **Add a permission**
2. Select **Microsoft Graph** → **Application permissions**
3. Search for and add: `DeviceManagementConfiguration.Read.All`
4. Click **Grant admin consent for [your org]**

### Step 3: Create Client Secret

1. Go to **Certificates & secrets** → **New client secret**
2. Set a description and expiry (recommend 24 months)
3. Copy the **Value** immediately (it won't be shown again)

### Step 4: Note Your IDs

From the app's **Overview** page, note:
- **Application (client) ID**
- **Directory (tenant) ID**
- The **Client Secret Value** from Step 3

### Step 5: Configure GitHub Secrets

In your GitHub repository: **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

Add these three secrets:

| Secret Name | Value |
|---|---|
| `AZURE_TENANT_ID` | Your tenant ID |
| `AZURE_CLIENT_ID` | Your app's client ID |
| `AZURE_CLIENT_SECRET` | Your client secret value |

### Step 6: Enable GitHub Pages

1. Go to **Settings** → **Pages**
2. Source: **GitHub Actions**

### Step 7: Run Initial Data Fetch

Either:
- Push to `main` to trigger the deploy workflow, OR
- Go to **Actions** → **Refresh Settings & Deploy** → **Run workflow**

## Fetch Live Data Locally

```bash
# Set environment variables
export AZURE_TENANT_ID="your-tenant-id"
export AZURE_CLIENT_ID="your-client-id"
export AZURE_CLIENT_SECRET="your-client-secret"

# Fetch all settings and categories from Microsoft Graph
npm run fetch-settings

# Generate changelog (diffs against previous snapshot)
npm run generate-changelog

# Build search index and category tree
npm run build-search-index

# Build the site
npm run build
```

Or all at once:
```bash
npm run refresh  # runs fetch + changelog + index
npm run build
```

## Project Structure

```
├── .github/workflows/
│   ├── refresh-and-deploy.yml   # Daily cron: fetch → diff → build → deploy
│   └── deploy-on-push.yml       # On push: build → deploy (uses existing data)
├── data/
│   ├── sample-categories.json   # Sample data for development
│   ├── sample-settings.json     # Sample data for development
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

## GitHub Actions Workflows

### Refresh & Deploy (Daily)
- **Trigger**: Cron at 06:00 UTC daily + manual
- **Steps**: Install → Fetch from Graph → Diff changelog → Build index → Commit data → Build site → Deploy to Pages

### Deploy on Push
- **Trigger**: Push to `main` (ignoring data-only commits)
- **Steps**: Install → Use existing data → Build index → Build site → Deploy to Pages

## Configuration

### GitHub Pages Base Path

If your site is hosted at `https://username.github.io/repo-name/`, uncomment the `basePath` and `assetPrefix` lines in `next.config.js`:

```js
basePath: '/repo-name',
assetPrefix: '/repo-name/',
```

### Customization

- **Colors**: Edit `tailwind.config.js` → `theme.extend.colors.fluent`
- **Daily schedule**: Edit `.github/workflows/refresh-and-deploy.yml` → `cron`
- **Search fields/weights**: Edit `src/lib/search.ts` → Document index config

## API Details

This project uses the **Microsoft Graph beta API**: 

| Endpoint | Purpose |
|---|---|
| `GET /beta/deviceManagement/configurationCategories` | Setting categories (hierarchy) |
| `GET /beta/deviceManagement/configurationSettings` | All setting definitions |

**Permission required**: `DeviceManagementConfiguration.Read.All` (Application)

> **Note**: These endpoints are beta-only. Microsoft supports beta APIs for Intune but they may change. The tenant requires an active Intune license.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Use sample data for development (`npx tsx scripts/setup-dev-data.ts`)
4. Ensure the site builds cleanly (`npm run build`)
5. Submit a pull request

## License

MIT
