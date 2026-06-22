import type { Metadata } from 'next';
import OIBChangelogViewer from '@/components/OIBChangelogViewer';

export const metadata: Metadata = {
  title: 'OIB Changelog | Intune Settings Catalog Viewer',
  description:
    'Compare any two versions of the OpenIntuneBaseline (OIB) — see which policies and settings were added, removed, renamed, or changed between releases.',
};

export const dynamic = 'force-static';

export default function BaselineChangelogPage() {
  return (
    <div className="max-w-[1600px] mx-auto">
      <OIBChangelogViewer />
    </div>
  );
}
