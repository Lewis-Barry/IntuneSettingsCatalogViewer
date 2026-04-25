import { loadCategoryTree, loadCategories, loadCatalogStats, getLastUpdated } from '@/lib/data';
import SettingsCatalogBrowser from '@/components/SettingsCatalogBrowser';

export default function HomePage() {
  // Load lightweight data at build time (server component).
  // Setting details are loaded client-side by category shard to avoid pulling
  // the full browse payload on initial page load.
  const categoryTree = loadCategoryTree();
  const categories = loadCategories();
  const catalogStats = loadCatalogStats();
  const lastUpdated = getLastUpdated();

  // Create serializable category maps (small — ~1 MB)
  const categoryMap: Record<string, string> = {};
  const categoryParentMap: Record<string, string> = {};
  for (const c of categories) {
    categoryMap[c.id] = c.displayName;
    categoryParentMap[c.id] = c.parentCategoryId;
  }

  return (
    <div className="max-w-[1600px] mx-auto">
      <SettingsCatalogBrowser
        categoryTree={categoryTree}
        categoryMap={categoryMap}
        categoryParentMap={categoryParentMap}
        totalSettings={catalogStats.totalSettings}
        lastUpdated={lastUpdated}
      />
    </div>
  );
}
