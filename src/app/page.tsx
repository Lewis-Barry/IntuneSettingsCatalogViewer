import { loadCategoryTree, loadCategories, getLastUpdated } from '@/lib/data';
import SettingsCatalogBrowser from '@/components/SettingsCatalogBrowser';

export default function HomePage() {
  // Load lightweight data at build time (server component).
  // Settings are loaded client-side from /settings-browse.json to avoid
  // embedding ~55 MB of data in the page HTML.
  const categoryTree = loadCategoryTree();
  const categories = loadCategories();
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
        lastUpdated={lastUpdated}
      />
    </div>
  );
}
