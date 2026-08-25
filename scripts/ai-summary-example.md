# AI summary example — 2026-08-18

Generated against the current `ai-summary-prompt.md` from the compacted
changelog diff for 2026-08-18 (93 added, 5 categories added, 271 categories
removed).

```json
{
  "headline": "Apple admins get the goods this time: Web Content Filter and DNS Proxy for iOS/macOS, plus full macOS Content Cache control — while Windows picks up schedulable update maintenance windows.",
  "highlights": [
    "iOS/macOS: new Web Content Filter category (15 settings) — network content filtering via a plugin, covering browsers, sockets, and packets. Worth a look if security is also your problem.",
    "macOS: Content Cache Settings (38 settings) — shared caching, peer ranges, cache limits, tethered caching. Actual bandwidth savings for offices on thin pipes.",
    "Windows: Maintenance Windows (~29 settings across two categories) — weekly/monthly windows for update actions. Set the defaults yourself before Microsoft sets them for you.",
    "Android: eSIM removal on wipe, separate work-profile lock, screen timeout — all back from the dead after Microsoft removed them on Aug 2. Keep up."
  ],
  "watchOut": "271 legacy Windows categories were removed in one sweep — if any existing profiles reference them, verify before the helpdesk does it for you."
}
```

Note: the Aug 2 / Aug 18 contradiction is only visible because the model had
cross-day context here. With single-day input the pipeline can't spot these —
sarcasm requires history. Feeding the previous entry's summary (or just its
added/removed setting IDs) would enable it.

---

# AI summary example — 2026-07-30

Same prompt, demonstrating the value-diff rule: 843 description edits this
day, of which exactly one mattered.

```json
{
  "headline": "Per-app privacy permission controls land for iOS/macOS (camera, mic, location defaults per app), and Windows gets Writing Assistance admin blocklists — alongside a catalog-wide reorganization touching ~3,900 settings.",
  "highlights": [
    "iOS/macOS: new App Settings category (~30 settings) — set per-app permission defaults for camera, microphone, and location, with allow/deny lists for apps and binaries",
    "Windows: Writing Assistance category (9 settings) — block specific apps and URLs from Windows Writing Assistance and control its install/startup behavior",
    "Linux: Platform Update category (8 settings) — schedule platform updates with windows, weekdays, or a fixed version",
    "Windows/Defender: new AI agent network inspection and AI agent protection settings"
  ],
  "watchOut": "macOS: 'Bluetooth Always (deprecated)' now says it plainly — Deprecated: use the `Privacy` key in the declarative `com.apple.configuration.app-settings` configuration. Migrate profiles before it vanishes. Also: ~3,900 settings changed category in a mass reorganization, so category-based links/bookmarks may break."
}
```

The other 842 description edits that day were wording polish like
"is that of" → "defines" and were correctly ignored. Without old/new text in
the input, the previous output lumped everything into one "text updates"
bullet and missed the deprecation — which was the only change with actual
migration work attached.
