# CAB Document Format — OpenIntuneBaseline Deployment

This document defines the structure and field conventions used when generating a
Change Advisory Board (CAB) submission for an OpenIntuneBaseline (OIB) deployment.
It is the source-of-truth for the Word document export feature in OIBBrowser.

---

## 1. Document Metadata

Stored as a properties table on the first page. All fields are editable by the
submitter after export.

| Field | Type | Notes |
|---|---|---|
| **Document title** | Auto | "OpenIntuneBaseline — CAB Change Submission" |
| **RFC / Change number** | Free text | Leave blank; reviewer fills in |
| **Change owner / Requestor** | Free text | Leave blank; reviewer fills in |
| **Proposed implementation date** | Free text | Leave blank; reviewer fills in |
| **OIB version (commit)** | Auto | Short SHA from `oibData.oibCommitSha` |
| **Data fetched** | Auto | `oibData.fetchedAt` formatted as "DD MMM YYYY" |
| **Generated** | Auto | Date/time document was generated |
| **Risk rating** | Dropdown placeholder | High / Medium / Low — reviewer selects |
| **Scope** | Auto | Platform(s) and categories included in this document |

---

## 2. Executive Summary

Auto-generated introductory paragraph inserted after the metadata table.
Tone: executive, non-technical, suitable for a CAB audience.

Template:
> This change request covers the deployment of the OpenIntuneBaseline (OIB)
> configuration policies to Microsoft Intune. OIB is a community-maintained,
> opinionated baseline of Intune Settings Catalog policies designed to establish
> a secure and consistent device management posture across [PLATFORM(S)].
>
> This submission includes **[N] policies** covering **[N] settings** across the
> following categories: [CATEGORY LIST].
>
> Policies are applied at [device / user / device and user] scope. All settings
> reflect the OIB recommendation at commit [SHORT SHA] and are documented in
> full in Section 4 of this document.

Placeholder tokens (resolved at generation time):
- `[PLATFORM(S)]` — comma-separated list of selected platforms (Windows, macOS, Windows 365)
- `[N] policies` — count of policies included
- `[N] settings` — total flattened setting count
- `[CATEGORY LIST]` — comma-separated unique category names
- `[SHORT SHA]` — first 7 characters of `oibData.oibCommitSha`

---

## 3. Rollback Plan

Fixed section with pre-filled placeholder text. Reviewer edits as needed.

> **Rollback approach:** In the event that issues are identified post-deployment,
> the following rollback steps should be followed:
>
> 1. In the Microsoft Intune admin centre, navigate to **Devices > Configuration**.
> 2. Locate the affected OIB policy (identifiable by the "OIB" prefix in its name).
> 3. Edit the policy assignment to remove all target groups, or delete the policy
>    entirely, to stop further enforcement.
> 4. For settings already applied to devices, a targeted remediation script or
>    manual reconfiguration may be required as Intune does not automatically
>    revert Settings Catalog values on policy removal.
> 5. Re-image or re-enrol devices only as a last resort.
>
> **Rollback lead:** [NAME]
> **Estimated rollback time:** [DURATION]
> **Rollback tested:** Yes / No

---

## 4. Policy Settings Detail

The main body of the document. Grouped in three levels:

### 4.1 Hierarchy

```
Platform (section heading — H1 style)
  └── Category (subsection heading — H2 style)
        └── Policy (policy block — H3 style + metadata line + settings table)
```

### 4.2 Platform heading

One heading per platform present in the export scope. Values: **Windows**,
**macOS**, **Windows 365** (display labels mapped from `oibFolder` values
`WINDOWS`, `MACOS`, `WINDOWS365`).

### 4.3 Category heading

One heading per unique `ParsedPolicy.category` within the platform. Category
is derived by `parsePolicy(policy).category`.

### 4.4 Policy block

Each policy renders as:

**Heading (H3):** `policy.name` with `.json` appended — matches the filename as
it appears in the OIB repository and in Intune policy exports, e.g.:
```
Win - OIB - SC - Device Security - D - Enhanced Phishing Protection - v3.0.json
```
No folder path prefix (e.g. no `WINDOWS/IntuneManagement/SettingsCatalog/`).


**Metadata line** (single line below the heading, smaller text):
```
Scope: Device  |  Tier: SC (Security Configuration)  |  Settings: 14  |  GitHub: [link]
```

Fields:
- Scope: "Device" or "User" (from `ParsedPolicy.scope`)
- Tier: "ES (Essential Security)" or "SC (Security Configuration)" or omitted for macOS/Win365
- Settings: count of flattened settings in this policy
- GitHub: hyperlink using `policy.githubUrl`

**Settings table** (one row per flattened setting):

| Column | Width | Source | Editable by reviewer |
|---|---|---|---|
| **#** | Narrow | Row number within this policy | No |
| **Setting name** | Wide | `SettingDefinition.name` if resolved; otherwise raw `definitionId` | No |
| **Configured value** | Medium | Human-readable value (see §4.5) | No |
| **Impact / Risk** | Medium | Empty | Yes |
| **Comments** | Wide | Empty | Yes |

Table style: Word table with header row, alternating row shading (light grey on
even rows), borders on all cells.

### 4.5 Value rendering

Values are resolved from the `OIBValue` union type as follows:

| OIBValue type | Display |
|---|---|
| `choice` | Option display name from `SettingDefinition.options[].name` if available; otherwise raw `optionId` |
| `choiceCollection` | Comma-separated option display names |
| `simple` | `String(value)` — booleans rendered as "Enabled" / "Disabled" for `true` / `false` |
| `simpleCollection` | Comma-separated stringified values |
| `group` / `groupCollection` | Not emitted directly (children are flattened by `flattenOIBSettings`) |
| `unknown` | *(not configured)* |

Boolean special case: `true` → **Enabled**, `false` → **Disabled**.

### 4.6 Settings with no definition match

If `defsMap.get(definitionId)` returns `undefined`, the setting row still
appears with the raw `definitionId` in the "Setting name" column and the raw
value in "Configured value". These rows are visually distinct (italic text) to
signal that the setting could not be resolved against the catalog.

---

## 5. Document Styling

Targeting `.docx` output (via a library such as `docx` / `docxjs`).

All structural elements must use **built-in Word paragraph styles** so that the
document is compatible with any corporate template the user applies after
export (Format → Styles, or attaching a `.dotx`). Do not apply manual font
sizes, colours, or spacing overrides — let the active Word theme control
appearance.

| Element | Word built-in style |
|---|---|
| Document title | `Title` |
| Platform heading | `Heading 1` (page break before) |
| Category heading | `Heading 2` |
| Policy heading | `Heading 3` |
| Metadata line (scope / tier / count / link) | `Subtitle` or `Caption` |
| Body text / intro paragraphs | `Normal` |
| Rollback numbered steps | `List Number` |
| Rollback bullet notes | `List Bullet` |
| Table header row | `Table Header` (or bold `Normal` inside a `Table Grid` table) |
| Table body rows | `Table Grid` — no manual fill colours; rely on table style |
| Footer | Built-in footer region — `Normal` style, centred |
| Footer text | "Generated by IntuneSettingsCatalogViewer · OIB commit [SHA] · [DATE]" |

**Table style:** Use `Table Grid` (Word built-in) applied at the table level.
This gives borders on all cells and respects the active theme. Do not set
manual cell shading or border colours.

**Unresolved settings** (no definition match): apply `Emphasis` character
style (italic) to the setting name cell rather than manual italic formatting.

---

## 6. Export Dialog (UI spec)

A modal dialog triggered by a "Generate CAB document" button in OIBBrowser.

Fields:
1. **Platform** — multi-select checkboxes (Windows / macOS / Windows 365); pre-ticked to match current active filter
2. **Categories** — "All categories" checkbox or per-category multi-select list (populated once platform is chosen)
3. **Filename** — editable text field, default: `OIB-CAB-[YYYYMMDD].docx`
4. **Generate** button — triggers client-side document build and download

The dialog should show a live count: "X policies · Y settings selected".

---

## 7. Appendix — Not included in document

The following are intentionally excluded:
- Setting descriptions (too verbose for a CAB table)
- CSP / OMA-URI paths (available on GitHub via the linked policy URL)
- Scope/Tier badge explanations (covered in executive summary)
