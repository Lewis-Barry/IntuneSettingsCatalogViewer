import { loadCategoryTree, loadCategories, loadCatalogStats, getLastUpdated } from '@/lib/data';
import SettingsCatalogBrowser from '@/components/SettingsCatalogBrowser';
import { Suspense } from 'react';
import type { BrowseTreeNode, CategoryTreeNode } from '@/lib/types';

export default function HomePage() {
  // Load lightweight data at build time (server component).
  // Setting details are loaded client-side by category shard to avoid pulling
  // the full browse payload on initial page load.
  const slim = ({ id, displayName, settingCount, children }: CategoryTreeNode): BrowseTreeNode => ({
    id, displayName, settingCount, children: children.map(slim),
  });
  const categoryTree = loadCategoryTree().map(slim);
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
      <Suspense fallback={<div role="status" className="p-6 text-fluent-text-secondary">Loading catalog...</div>}>
        <SettingsCatalogBrowser
          categoryTree={categoryTree}
          categoryMap={categoryMap}
          categoryParentMap={categoryParentMap}
          totalSettings={catalogStats.totalSettings}
          lastUpdated={lastUpdated}
        />
      </Suspense>
    </div>
  );
}
