import { loadCategoryTree, loadCategories } from '@/lib/data';
import SkuReportBrowser from '@/components/SkuReportBrowser';
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
      <SkuReportBrowser
        categoryTree={categoryTree}
        categoryMap={categoryMap}
        dataFile="pro-exclusive.json"
        heading={
          <>
            I{' '}
            <span className="text-red-500" aria-hidden="true">♥</span>
            {' '}Windows Pro
          </>
        }
        countLabel={
          <>
            available on Enterprise but <span className="font-semibold text-fluent-error">not</span> on Professional
          </>
        }
        allLabel="All Enterprise-only settings"
        noun="Enterprise-only settings"
        exportName="enterprise-only-settings"
        exportTitle="Enterprise-only Settings (not in Windows Pro)"
      />
    </div>
  );
}
