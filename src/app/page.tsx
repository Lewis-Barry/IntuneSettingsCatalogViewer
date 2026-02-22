import { loadCategoryTree, loadSettings, loadCategories, getLastUpdated, loadCategoryMergeMap } from '@/lib/data';
import SettingsCatalogBrowser from '@/components/SettingsCatalogBrowser';

export default function HomePage() {
  // Load all data at build time (server component)
  const categoryTree = loadCategoryTree();
  const settings = loadSettings();
  const categories = loadCategories();
  const lastUpdated = getLastUpdated();
  const categoryMergeMap = loadCategoryMergeMap();

  // Create a serializable category map
  const categoryMap: Record<string, string> = {};
  const categoryParentMap: Record<string, string> = {};
  for (const c of categories) {
    categoryMap[c.id] = c.displayName;
    categoryParentMap[c.id] = c.parentCategoryId;
  }

  // Group settings by category ID for quick lookup.
  // When a category was merged into another (via categoryMergeMap), redirect
  // its settings to the primary category so they appear together in the UI.
  const settingsByCategoryId: Record<string, typeof settings> = {};
  for (const s of settings) {
    const effectiveCatId = categoryMergeMap[s.categoryId] || s.categoryId;
    if (effectiveCatId !== s.categoryId) {
      // Update the setting object so downstream code (search grouping, etc.)
      // uses the merged primary category ID consistently.
      s.categoryId = effectiveCatId;
    }
    if (!settingsByCategoryId[effectiveCatId]) {
      settingsByCategoryId[effectiveCatId] = [];
    }
    settingsByCategoryId[effectiveCatId].push(s);
  }

  // Fill in any orphan category IDs referenced by settings but missing from
  // categories.json.  Use "Unknown Category" so GUIDs never appear in the UI.
  for (const catId of Object.keys(settingsByCategoryId)) {
    if (!categoryMap[catId]) {
      categoryMap[catId] = 'Unknown Category';
    }
  }

  return (
    <div className="max-w-[1600px] mx-auto">
      <SettingsCatalogBrowser
        categoryTree={categoryTree}
        settingsByCategory={settingsByCategoryId}
        categoryMap={categoryMap}
        categoryParentMap={categoryParentMap}
        totalSettings={settings.length}
        lastUpdated={lastUpdated}
      />
    </div>
  );
}
