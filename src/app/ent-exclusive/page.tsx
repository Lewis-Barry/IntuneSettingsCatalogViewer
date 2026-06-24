import { loadCategoryTree, loadCategories } from '@/lib/data';
import ProExclusiveBrowser from '@/components/ProExclusiveBrowser';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'I ♥ Windows Pro | Intune Settings Catalog Viewer',
  description:
    'Settings available on Windows Enterprise but not Windows Professional — discover what Enterprise licenses unlock in the Intune Settings Catalog.',
};

export const dynamic = 'force-static';

export default function ProExclusivePage() {
  const categoryTree = loadCategoryTree();
  const categories = loadCategories();

  const categoryMap: Record<string, string> = {};
  for (const c of categories) {
    categoryMap[c.id] = c.displayName;
  }

  return (
    <div className="max-w-[1600px] mx-auto">
      <ProExclusiveBrowser categoryTree={categoryTree} categoryMap={categoryMap} />
    </div>
  );
}
