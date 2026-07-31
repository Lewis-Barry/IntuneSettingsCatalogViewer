import type { Metadata } from 'next';
import BaselineChangelogViewer from '@/components/BaselineChangelogViewer';

export const metadata: Metadata = {
  title: 'Security Baseline Changelog | Intune Settings Catalog Viewer',
  description:
    'Compare any two versions of a Microsoft Intune security baseline — see which setting defaults were added, removed, or changed between releases.',
};

export const dynamic = 'force-static';

export default function BaselinesChangelogPage() {
  return (
    <div className="max-w-[1600px] mx-auto">
      <BaselineChangelogViewer />
    </div>
  );
}
