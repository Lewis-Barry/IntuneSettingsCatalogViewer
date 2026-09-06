# Intune Settings Catalog Viewer

A fast, searchable reference for the **Microsoft Intune Settings Catalog**; browse every available setting across all platforms without signing into the Intune portal. Just open the site in any browser.

Have an idea for a new feature? Open an issue in this repository so the community can discuss it and track progress.

Built with Next.js, TypeScript, and Tailwind CSS. Data is pulled daily from the Microsoft Graph API by GitHub Actions, statically rendered, and deployed to GitHub Pages. The site makes **zero runtime API calls**, everything is baked in at build time.

![Next.js](https://img.shields.io/badge/Next.js-14-black) ![TypeScript](https://img.shields.io/badge/TypeScript-5-blue) ![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-38bdf8) ![GitHub Pages](https://img.shields.io/badge/Hosted_on-GitHub_Pages-222) ![License](https://img.shields.io/badge/License-GPL--3.0-blue)

## Live Site

> **https://intunesettings.app**

No installation, no sign-in. Data is refreshed automatically every day.

---

## Features

- Browse settings by category with a hierarchical tree and setting counts.
- Search quickly across the catalog with relevance-ranked, client-side results.
- Filter by platform (Windows, macOS, iOS/iPadOS, Android, Linux, or all).
- Open dedicated setting pages with detailed metadata and related child settings.
- Track additions, removals, and changes through the built-in changelog view.
- Use OIB Lookup to browse OpenIntuneBaseline policies and see configured values.
- Compare any two OIB versions in OIB Changelog to review adds, removals, renames, and value changes.
- Browse Microsoft's Intune security baseline templates in MS Baselines, with every recommended default resolved.
- Compare any two versions of a Microsoft security baseline to see which setting defaults were added, removed, or changed.
- Select Windows in the catalog to filter for Enterprise-only settings (not in Pro) or AVD multi-session compatibility. Search, browse categories, and export the filtered settings as CSV or HTML. Platform and compatibility selections are shareable through the page URL; the former report URLs forward to the catalog.
- Use shareable deep links for categories and individual settings.
- Navigate comfortably on desktop and mobile with keyboard-friendly UI patterns.
- Benefit from a static, fast-loading site with no runtime API calls.

---

## Local Development

After generating the catalog with `npm run build-search-index`, run `npm run dev` for local development or `npm run build` for a static export. Both commands first run `build-browser-data` to regenerate the performance assets and manifests from the existing catalog payloads without refreshing the catalog itself.

Baseline views use content-versioned definition subsets covering current and historical policies, including parent definitions. Catalog categories spanning at least 16 populated shards have subtree bundles; small selections retain individual shards. Failed browser requests are evicted from the shared cache so they can be retried.

Run `npm run check-browser-data` after generation to check definition coverage, category parity, content versions, caching, retries, and staggered shard loading.

Search runs in a worker and caches a compact numeric-ID index with its documents in IndexedDB. The cache is replaced when catalog content or the installed FlexSearch version changes; missing, blocked, stale, or invalid caches fall back to rebuilding. Only catalog data is persisted, not search queries. Changes to the indexed fields or tokenization options must also bump the `CACHE_VERSION` format prefix in `src/lib/search.worker.ts`.

Run `npm run check-search-worker` to check cold/warm result parity and cache recovery, and `npm run check-search-performance` to check compatibility filtering, lazy match-source calculations, and shared grouping.

## License

[GPL-3.0](LICENSE)
