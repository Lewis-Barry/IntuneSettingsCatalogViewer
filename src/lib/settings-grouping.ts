import type { SettingDefinition } from './types';

/**
 * Derive the CSP path for a setting from its baseUri + offsetUri.
 */
export function getCspPath(s: SettingDefinition): string {
  return s.baseUri && s.offsetUri
    ? `${s.baseUri}/${s.offsetUri}`
    : s.baseUri || s.offsetUri || '';
}

/**
 * Check whether a setting is a synthetic "Top Level Setting Group Collection"
 * container — an API-internal wrapper whose children are the real settings.
 */
function isSyntheticGroupContainer(s: SettingDefinition): boolean {
  return (
    !!s['@odata.type']?.includes('SettingGroupCollectionDefinition') &&
    s.displayName === 'Top Level Setting Group Collection'
  );
}

/**
 * Check whether a setting is a root setting (no parent, or self-referencing).
 */
function isRootSetting(s: SettingDefinition): boolean {
  return !s.rootDefinitionId || s.rootDefinitionId === s.id;
}

/**
 * Group a flat array of settings into root-level settings and a child map,
 * applying the same logic that determines which settings appear as top-level
 * rows in the UI:
 *
 *  - Synthetic group containers are removed; their children are promoted.
 *  - Child settings whose CSP path is identical to their parent's are dropped.
 *  - Children whose parent is present are nested (not top-level).
 *  - Orphan children (parent absent or is synthetic) are promoted to top-level.
 *  - Collection items ([{0}] in offsetUri) are nested under their header.
 *
 * Returns `{ rootSettings, childMap }` where:
 *  - `rootSettings` are the visible top-level rows (sorted alphabetically).
 *  - `childMap` maps parentId → nested children (sorted alphabetically).
 */
export function groupSettings(settings: SettingDefinition[]): {
  rootSettings: SettingDefinition[];
  childMap: Map<string, SettingDefinition[]>;
} {
  const childMap = new Map<string, SettingDefinition[]>();
  const rootSettings: SettingDefinition[] = [];
  const rootIds = new Set<string>();
  const syntheticGroupIds = new Set<string>();

  // Build a quick id → setting lookup for CSP-path deduplication
  const settingById = new Map<string, SettingDefinition>();
  for (const s of settings) settingById.set(s.id, s);

  // First pass: identify root settings (skip synthetic group containers)
  for (const s of settings) {
    if (isRootSetting(s)) {
      if (isSyntheticGroupContainer(s)) {
        syntheticGroupIds.add(s.id);
      } else {
        rootSettings.push(s);
        rootIds.add(s.id);
      }
    }
  }

  // Second pass: group children, but promote orphans whose root is absent
  // or whose root is a synthetic group container.
  // Skip children whose CSP path is identical to their parent's — they add
  // no new information and would appear as duplicate entries.
  for (const s of settings) {
    if (s.rootDefinitionId && s.rootDefinitionId !== s.id) {
      if (syntheticGroupIds.has(s.rootDefinitionId)) {
        // Parent is a synthetic group — promote child to root
        rootSettings.push(s);
        rootIds.add(s.id);
      } else if (rootIds.has(s.rootDefinitionId)) {
        // Skip child if its CSP path is identical to the parent's
        const parent = settingById.get(s.rootDefinitionId);
        if (parent && getCspPath(s) === getCspPath(parent)) continue;
        // Parent is present — attach as child
        const children = childMap.get(s.rootDefinitionId) || [];
        children.push(s);
        childMap.set(s.rootDefinitionId, children);
      } else {
        // Parent is absent (e.g. search didn't match it) — promote to root
        rootSettings.push(s);
        rootIds.add(s.id);
      }
    }
  }

  // ── Collection grouping (offsetUri-based) ──
  // Settings with [{0}] in their offsetUri belong to a repeatable collection.
  // Find the matching SettingGroupCollectionDefinition header and nest those
  // items under it, removing them from the top-level root list.
  const collectionHeaders = new Map<string, SettingDefinition>(); // offsetUri → setting
  for (const s of rootSettings) {
    if (
      s['@odata.type']?.includes('SettingGroupCollectionDefinition') &&
      s.offsetUri &&
      !s.offsetUri.includes('[{0}]')
    ) {
      collectionHeaders.set(s.offsetUri, s);
    }
  }

  if (collectionHeaders.size > 0) {
    const toRemoveFromRoot = new Set<string>();
    for (const s of rootSettings) {
      if (!s.offsetUri || !s.offsetUri.includes('[{0}]')) continue;
      const prefixEnd = s.offsetUri.indexOf('/[{0}]');
      if (prefixEnd < 0) continue;
      const prefix = s.offsetUri.substring(0, prefixEnd);
      const header = collectionHeaders.get(prefix);
      if (header) {
        const children = childMap.get(header.id) || [];
        children.push(s);
        childMap.set(header.id, children);
        toRemoveFromRoot.add(s.id);
      }
    }

    // Also nest existing childMap entries that match collection patterns.
    for (const [parentId, children] of childMap) {
      if (collectionHeaders.has(parentId)) continue;
      const remaining: SettingDefinition[] = [];
      for (const child of children) {
        if (!child.offsetUri || !child.offsetUri.includes('[{0}]')) {
          remaining.push(child);
          continue;
        }
        const prefixEnd = child.offsetUri.indexOf('/[{0}]');
        if (prefixEnd < 0) {
          remaining.push(child);
          continue;
        }
        const prefix = child.offsetUri.substring(0, prefixEnd);
        const header = collectionHeaders.get(prefix);
        if (header && header.id !== parentId) {
          const hChildren = childMap.get(header.id) || [];
          hChildren.push(child);
          childMap.set(header.id, hChildren);
        } else {
          remaining.push(child);
        }
      }
      if (remaining.length !== children.length) {
        childMap.set(parentId, remaining);
      }
    }

    // Remove items that were moved under a collection header
    if (toRemoveFromRoot.size > 0) {
      for (let i = rootSettings.length - 1; i >= 0; i--) {
        if (toRemoveFromRoot.has(rootSettings[i].id)) {
          rootSettings.splice(i, 1);
        }
      }
    }
  }

  // Sort root settings alphabetically
  rootSettings.sort((a, b) =>
    (a.displayName || a.name || '').localeCompare(b.displayName || b.name || '')
  );

  // Sort collection children alphabetically within each group
  for (const [, children] of childMap) {
    children.sort((a, b) =>
      (a.displayName || a.name || '').localeCompare(b.displayName || b.name || '')
    );
  }

  return { rootSettings, childMap };
}

/**
 * Count the number of visible top-level (root) settings that would be
 * rendered for the given flat settings array — applying the same grouping,
 * deduplication, and nesting logic as `groupSettings()`.
 *
 * This is useful for computing accurate result counts in search headers
 * without materialising the full grouping structure.
 */
export function countVisibleRootSettings(settings: SettingDefinition[]): number {
  return groupSettings(settings).rootSettings.length;
}
