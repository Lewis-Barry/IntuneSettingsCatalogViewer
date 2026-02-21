import { loadCategoryTree, loadSettings, loadCategories, getLastUpdated } from '@/lib/data';
import SettingsCatalogBrowser from '@/components/SettingsCatalogBrowser';

export default function HomePage() {
  // Load all data at build time (server component)
  const categoryTree = loadCategoryTree();
  const settings = loadSettings();
  const categories = loadCategories();
  const lastUpdated = getLastUpdated();

  // Create a serializable category map
  const categoryMap: Record<string, string> = {};
  const categoryParentMap: Record<string, string> = {};
  for (const c of categories) {
    categoryMap[c.id] = c.displayName;
    categoryParentMap[c.id] = c.parentCategoryId;
  }

  // Group settings by category ID for quick lookup
  const settingsByCategoryId: Record<string, typeof settings> = {};
  for (const s of settings) {
    if (!settingsByCategoryId[s.categoryId]) {
      settingsByCategoryId[s.categoryId] = [];
    }
    settingsByCategoryId[s.categoryId].push(s);
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
