import manifestJson from '../../data/category-load-manifest.json';
import { loadBrowserJson } from './browser-data';
import type { SettingDefinition } from './types';

interface CategoryLoad {
  file: string;
  categoryIds: string[];
}

const manifest: {
  files: Record<string, string | null>;
  bundles: Record<string, CategoryLoad>;
} = manifestJson;

export function planCategoryLoads(categoryIds: string[], loadedIds: ReadonlySet<string>): CategoryLoad[] {
  const requested = new Set(categoryIds);
  const remaining = new Set(categoryIds.filter((id) => !loadedIds.has(id) && manifest.files[id]));
  const loads: CategoryLoad[] = [];
  const bundles = Object.values(manifest.bundles).sort((first, second) => second.categoryIds.length - first.categoryIds.length);
  for (const bundle of bundles) {
    if (!bundle.categoryIds.every((id) => requested.has(id))) continue;
    const populated = bundle.categoryIds.filter((id) => manifest.files[id]);
    const missing = populated.filter((id) => remaining.has(id));
    if (missing.length < 16 || missing.length < populated.length / 2) continue;
    loads.push(bundle);
    for (const id of bundle.categoryIds) remaining.delete(id);
  }
  for (const id of remaining) loads.push({ file: manifest.files[id]!, categoryIds: [id] });
  return loads;
}

export async function loadCategorySettings(categoryIds: string[], loadedIds: ReadonlySet<string>): Promise<Record<string, SettingDefinition[]>> {
  const loads = planCategoryLoads(categoryIds, loadedIds);
  const byCategory: Record<string, SettingDefinition[]> = {};
  for (const id of categoryIds) {
    if (!loadedIds.has(id)) byCategory[id] = [];
  }
  const results = await Promise.all(loads.map((load) => loadBrowserJson<SettingDefinition[]>(load.file)));
  for (const settings of results) {
    for (const setting of settings) (byCategory[setting.categoryId] ??= []).push(setting);
  }
  return byCategory;
}