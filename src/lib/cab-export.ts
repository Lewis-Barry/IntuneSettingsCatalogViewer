/**
 * CAB document export — generates an OpenIntuneBaseline Change Advisory Board
 * submission as a .docx file and triggers a browser download.
 *
 * Uses Word built-in styles throughout so the document is compatible with any
 * corporate .dotx template the user applies after export.
 *
 * Document layout:
 *   Section 1 — Portrait  : Title, Metadata, Executive Summary, Rollback Plan
 *   Section 2 — Landscape : Policy Settings Detail (one page per policy)
 */

import type { Paragraph, Table } from 'docx';
import type { OIBOutput, OIBPolicy, FlatSetting } from './oib-types';
import { parsePolicy, flattenOIBSettings } from './oib-types';
import type { SettingDefinition } from './types';

// ── Constants ─────────────────────────────────────────────────────────────────

const FOLDER_LABELS: Record<string, string> = {
  WINDOWS: 'Windows',
  MACOS: 'macOS',
  WINDOWS365: 'Windows 365',
};

const FOLDER_ORDER = ['WINDOWS', 'MACOS', 'WINDOWS365'];

// Usable table widths in DXA (A4 minus 25.4mm margins each side)
const PORTRAIT_TABLE_WIDTH  = 9000;  // 210mm - 2×25.4mm ≈ 9024 DXA
const LANDSCAPE_TABLE_WIDTH = 13800; // 297mm - 2×25.4mm ≈ 13958 DXA

// Portrait metadata table column widths (sum = PORTRAIT_TABLE_WIDTH)
const META_COL = { field: 2800, value: 6200 };

// Landscape settings table column widths (sum = LANDSCAPE_TABLE_WIDTH)
const LCOL = { num: 500, name: 5200, value: 3200, risk: 2400, comments: 2500 };

// ── Value rendering ───────────────────────────────────────────────────────────

function renderOIBValue(flat: FlatSetting, def: SettingDefinition | undefined): string {
  const v = flat.value;

  if (v.type === 'simple') {
    if (v.value === true) return 'Enabled';
    if (v.value === false) return 'Disabled';
    if (v.value === null || v.value === undefined) return '(not configured)';
    return String(v.value);
  }

  if (v.type === 'choice') {
    if (def?.options) {
      const opt = def.options.find((o) => o.itemId === v.optionId);
      if (opt) return opt.displayName || opt.name || v.optionId;
    }
    return v.optionId;
  }

  if (v.type === 'choiceCollection') {
    if (def?.options) {
      return v.optionIds
        .map((id) => {
          const opt = def.options!.find((o) => o.itemId === id);
          return opt ? opt.displayName || opt.name || id : id;
        })
        .join(', ');
    }
    return v.optionIds.join(', ');
  }

  if (v.type === 'simpleCollection') {
    return v.values
      .map((val) => {
        if (val === true) return 'Enabled';
        if (val === false) return 'Disabled';
        if (val === null) return '';
        return String(val);
      })
      .join(', ');
  }

  if (v.type === 'unknown') return '(not configured)';
  return '';
}

// ── Date helpers ──────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatNow() {
  return new Date().toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function todayYMD() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

export function defaultCABFilename() {
  return `OIB-CAB-${todayYMD()}.docx`;
}

// ── Export options ────────────────────────────────────────────────────────────

export interface CABExportOptions {
  policies: OIBPolicy[];
  defsMap: Map<string, SettingDefinition>;
  oibData: OIBOutput;
  selectedFolders: string[];
  filename: string;
}

// ── Main export function ──────────────────────────────────────────────────────

export async function generateAndDownloadCAB(options: CABExportOptions): Promise<void> {
  const { policies, defsMap, oibData, selectedFolders, filename } = options;

  // Dynamic import keeps docx out of the initial bundle
  const {
    Document,
    Packer,
    Paragraph,
    TextRun,
    Table,
    TableRow,
    TableCell,
    HeadingLevel,
    AlignmentType,
    Footer,
    ExternalHyperlink,
    WidthType,
    PageOrientation,
    SectionType,
  } = await import('docx');

  // ── Aggregate stats ───────────────────────────────────────────────────────

  const totalSettings = policies.reduce(
    (n, p) => n + flattenOIBSettings(p.settings).length,
    0,
  );

  const uniqueCategories = Array.from(
    new Set(policies.map((p) => parsePolicy(p).category)),
  ).sort();

  const scopes = new Set(policies.map((p) => parsePolicy(p).scope));
  const scopeLabel =
    scopes.has('D') && scopes.has('U')
      ? 'device and user'
      : scopes.has('D')
        ? 'device'
        : 'user';

  const commitSha = oibData.oibCommitSha?.slice(0, 7) ?? 'unknown';
  const platformLabels = selectedFolders.map((f) => FOLDER_LABELS[f] ?? f);
  const generatedAt = formatNow();

  // ── Shorthand builders ────────────────────────────────────────────────────

  const p = (style: string, children: ConstructorParameters<typeof TextRun>[0][]) =>
    new Paragraph({ style, children: children.map((c) => new TextRun(c)) });

  const h = (
    level: (typeof HeadingLevel)[keyof typeof HeadingLevel],
    text: string,
    pageBreakBefore = false,
  ) => new Paragraph({ heading: level, pageBreakBefore, children: [new TextRun(text)] });

  function kvRow(field: string, value: string) {
    return new TableRow({
      children: [
        new TableCell({
          width: { size: META_COL.field, type: WidthType.DXA },
          children: [new Paragraph({ children: [new TextRun({ text: field, bold: true })] })],
        }),
        new TableCell({
          width: { size: META_COL.value, type: WidthType.DXA },
          children: [new Paragraph({ children: [new TextRun(value)] })],
        }),
      ],
    });
  }

  // ── Shared footer ─────────────────────────────────────────────────────────

  function makeFooter() {
    return new Footer({
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun(
              `Generated by IntuneSettingsCatalogViewer · OIB commit ${commitSha} · ${generatedAt}`,
            ),
          ],
        }),
      ],
    });
  }

  // ── Portrait section content ──────────────────────────────────────────────

  const metadataTable = new Table({
    style: 'TableGrid',
    width: { size: PORTRAIT_TABLE_WIDTH, type: WidthType.DXA },
    rows: [
      kvRow('RFC / Change number', ''),
      kvRow('Change owner / Requestor', ''),
      kvRow('Proposed implementation date', ''),
      kvRow('Risk rating', 'High / Medium / Low'),
      kvRow('OIB commit', commitSha),
      kvRow('Data fetched', formatDate(oibData.fetchedAt)),
      kvRow('Document generated', generatedAt),
      kvRow('Platforms', platformLabels.join(', ')),
      kvRow('Categories', uniqueCategories.join(', ') || 'All'),
      kvRow('Policies included', String(policies.length)),
    ],
  });

  const execSummary = [
    new Paragraph({
      style: 'Normal',
      children: [
        new TextRun(
          `This change request covers the deployment of the OpenIntuneBaseline (OIB) ` +
          `configuration policies to Microsoft Intune. OIB is a community-maintained, ` +
          `opinionated baseline of Intune Settings Catalog policies designed to establish ` +
          `a secure and consistent device management posture across ${platformLabels.join(', ')}.`,
        ),
      ],
    }),
    new Paragraph({
      style: 'Normal',
      children: [
        new TextRun('This submission includes '),
        new TextRun({ text: `${policies.length} ${policies.length === 1 ? 'policy' : 'policies'}`, bold: true }),
        new TextRun(' covering '),
        new TextRun({ text: `${totalSettings.toLocaleString()} settings`, bold: true }),
        new TextRun(
          ` across the following ${uniqueCategories.length === 1 ? 'category' : 'categories'}: ` +
          uniqueCategories.join(', ') + '.',
        ),
      ],
    }),
    new Paragraph({
      style: 'Normal',
      children: [
        new TextRun(
          `Policies are applied at ${scopeLabel} scope. All settings reflect the OIB ` +
          `recommendation at commit ${commitSha} and are documented in full in the ` +
          `Policy Settings Detail section of this document.`,
        ),
      ],
    }),
  ];

  const rollbackPlan = [
    new Paragraph({
      style: 'Normal',
      children: [
        new TextRun(
          'In the event that issues are identified post-deployment, the following ' +
          'rollback steps should be followed:',
        ),
      ],
    }),
    new Paragraph({
      style: 'ListNumber',
      children: [
        new TextRun('In the Microsoft Intune admin centre, navigate to '),
        new TextRun({ text: 'Devices > Configuration', bold: true }),
        new TextRun('.'),
      ],
    }),
    new Paragraph({
      style: 'ListNumber',
      children: [new TextRun('Locate the affected OIB policy (identifiable by the "OIB" prefix in its name).')],
    }),
    new Paragraph({
      style: 'ListNumber',
      children: [
        new TextRun(
          'Edit the policy assignment to remove all target groups, or delete the policy entirely, ' +
          'to stop further enforcement.',
        ),
      ],
    }),
    new Paragraph({
      style: 'ListNumber',
      children: [
        new TextRun(
          'For settings already applied to devices, a targeted remediation script or manual ' +
          'reconfiguration may be required, as Intune does not automatically revert Settings Catalog ' +
          'values on policy removal.',
        ),
      ],
    }),
    new Paragraph({
      style: 'ListNumber',
      children: [new TextRun('Re-image or re-enrol devices only as a last resort.')],
    }),
    p('Normal', []),
    p('Normal', [{ text: 'Rollback lead: ', bold: true }, '[NAME]']),
    p('Normal', [{ text: 'Estimated rollback time: ', bold: true }, '[DURATION]']),
    p('Normal', [{ text: 'Rollback tested: ', bold: true }, 'Yes / No']),
  ];

  // ── Landscape section: settings table builder ─────────────────────────────

  function buildSettingsTable(flats: FlatSetting[]) {
    const headerRow = new TableRow({
      tableHeader: true,
      children: [
        new TableCell({
          width: { size: LCOL.num, type: WidthType.DXA },
          children: [new Paragraph({ children: [new TextRun({ text: '#', bold: true })] })],
        }),
        new TableCell({
          width: { size: LCOL.name, type: WidthType.DXA },
          children: [new Paragraph({ children: [new TextRun({ text: 'Setting name', bold: true })] })],
        }),
        new TableCell({
          width: { size: LCOL.value, type: WidthType.DXA },
          children: [new Paragraph({ children: [new TextRun({ text: 'Configured value', bold: true })] })],
        }),
        new TableCell({
          width: { size: LCOL.risk, type: WidthType.DXA },
          children: [new Paragraph({ children: [new TextRun({ text: 'Impact / Risk', bold: true })] })],
        }),
        new TableCell({
          width: { size: LCOL.comments, type: WidthType.DXA },
          children: [new Paragraph({ children: [new TextRun({ text: 'Comments', bold: true })] })],
        }),
      ],
    });

    const dataRows = flats.map((flat, idx) => {
      const def = defsMap.get(flat.definitionId);
      const isUnresolved = !def;
      const settingName = def ? (def.displayName || def.name) : flat.definitionId;
      const value = renderOIBValue(flat, def);

      return new TableRow({
        children: [
          new TableCell({
            width: { size: LCOL.num, type: WidthType.DXA },
            children: [new Paragraph({ children: [new TextRun(String(idx + 1))] })],
          }),
          new TableCell({
            width: { size: LCOL.name, type: WidthType.DXA },
            children: [
              new Paragraph({
                children: [new TextRun({ text: settingName, italics: isUnresolved })],
              }),
            ],
          }),
          new TableCell({
            width: { size: LCOL.value, type: WidthType.DXA },
            children: [new Paragraph({ children: [new TextRun(value)] })],
          }),
          new TableCell({
            width: { size: LCOL.risk, type: WidthType.DXA },
            children: [new Paragraph({ children: [] })],
          }),
          new TableCell({
            width: { size: LCOL.comments, type: WidthType.DXA },
            children: [new Paragraph({ children: [] })],
          }),
        ],
      });
    });

    return new Table({
      style: 'TableGrid',
      width: { size: LANDSCAPE_TABLE_WIDTH, type: WidthType.DXA },
      rows: [headerRow, ...dataRows],
    });
  }

  // ── Build landscape detail children ──────────────────────────────────────

  const detailChildren: (Paragraph | Table)[] = [];
  const foldersToRender = FOLDER_ORDER.filter((f) => selectedFolders.includes(f));
  let isFirstPolicy = true;

  for (const folder of foldersToRender) {
    const folderPolicies = policies.filter((pol) => pol.oibFolder === folder);
    if (folderPolicies.length === 0) continue;

    detailChildren.push(h(HeadingLevel.HEADING_1, FOLDER_LABELS[folder] ?? folder));

    // Group by category (sorted)
    const categoryMap = new Map<string, OIBPolicy[]>();
    for (const pol of folderPolicies) {
      const cat = parsePolicy(pol).category;
      if (!categoryMap.has(cat)) categoryMap.set(cat, []);
      categoryMap.get(cat)!.push(pol);
    }

    for (const [category, catPolicies] of Array.from(categoryMap.entries()).sort(
      ([a], [b]) => a.localeCompare(b),
    )) {
      detailChildren.push(h(HeadingLevel.HEADING_2, category));

      for (const policy of catPolicies) {
        const parsed = parsePolicy(policy);
        const flats = flattenOIBSettings(policy.settings);

        // H3: full filename — page break before every policy
        detailChildren.push(
          new Paragraph({
            heading: HeadingLevel.HEADING_3,
            pageBreakBefore: !isFirstPolicy,
            children: [new TextRun(`${policy.name}.json`)],
          }),
        );
        isFirstPolicy = false;

        // Metadata line (Caption style)
        const tierText =
          parsed.tier === 'ES'
            ? 'ES (Essential Security)'
            : parsed.tier === 'SC'
              ? 'SC (Security Configuration)'
              : null;
        const metaParts = [
          `Scope: ${parsed.scope === 'D' ? 'Device' : 'User'}`,
          tierText,
          `Settings: ${flats.length}`,
        ]
          .filter(Boolean)
          .join('  |  ');

        detailChildren.push(
          new Paragraph({
            style: 'Caption',
            children: [
              new TextRun(metaParts + '  |  '),
              new ExternalHyperlink({
                link: policy.githubUrl,
                children: [new TextRun({ text: 'View on GitHub', style: 'Hyperlink' })],
              }),
            ],
          }),
        );

        if (flats.length > 0) {
          detailChildren.push(buildSettingsTable(flats));
        }
      }
    }
  }

  // ── Assemble two-section document ─────────────────────────────────────────

  const doc = new Document({
    sections: [
      // ── Section 1: Portrait (front matter) ──────────────────────────────
      {
        properties: {
          page: {
            size: { orientation: PageOrientation.PORTRAIT },
          },
        },
        footers: { default: makeFooter() },
        children: [
          new Paragraph({
            heading: HeadingLevel.TITLE,
            children: [new TextRun('OpenIntuneBaseline — CAB Change Submission')],
          }),
          metadataTable,
          p('Normal', []),
          h(HeadingLevel.HEADING_1, 'Executive Summary'),
          ...execSummary,
          p('Normal', []),
          h(HeadingLevel.HEADING_1, 'Rollback Plan'),
          ...rollbackPlan,
        ],
      },

      // ── Section 2: Landscape (policy settings detail) ────────────────────
      {
        properties: {
          type: SectionType.NEXT_PAGE,
          page: {
            size: { orientation: PageOrientation.LANDSCAPE },
          },
        },
        footers: { default: makeFooter() },
        children: [
          h(HeadingLevel.HEADING_1, 'Policy Settings Detail'),
          ...detailChildren,
        ],
      },
    ],
  });

  // ── Download ──────────────────────────────────────────────────────────────

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
