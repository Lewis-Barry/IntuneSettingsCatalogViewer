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
- Explore the Windows Enterprise vs Pro view to find settings not available on Windows Professional.
- Use shareable deep links for categories and individual settings.
- Navigate comfortably on desktop and mobile with keyboard-friendly UI patterns.
- Benefit from a static, fast-loading site with no runtime API calls.

---

## License

[GPL-3.0](LICENSE)
