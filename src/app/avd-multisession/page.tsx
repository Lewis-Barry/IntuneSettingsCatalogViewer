import { loadCategoryTree, loadCategories } from '@/lib/data';
import SkuReportBrowser from '@/components/SkuReportBrowser';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'AVD Multi-Session | Intune Settings Catalog Viewer',
  description:
    'Settings Catalog policies available on Windows Enterprise multi-session — the Azure Virtual Desktop (AVD) SKU.',
};

export const dynamic = 'force-static';

export default function AvdMultiSessionPage() {
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
        dataFile="avd-multisession.json"
        heading="AVD Multi-Session"
        countLabel="available on Windows Enterprise multi-session (AVD)"
        allLabel="All Multi-Session settings"
        noun="Multi-Session settings"
        exportName="avd-multisession-settings"
        exportTitle="Settings available on Windows AVD Multi-Session"
      />
    </div>
  );
}
