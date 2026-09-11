import { Suspense } from 'react';
import { loadComplianceTemplates } from '@/lib/data';
import ComplianceBrowser from '@/components/ComplianceBrowser';

export const metadata = {
  title: 'Compliance Settings | Intune Settings Catalog Viewer',
  description:
    'Browse every setting available in Intune compliance policies, across all platforms, with their possible values.',
};

export default function CompliancePage() {
  // Loaded at build time and passed as a prop, exactly like src/app/page.tsx —
  // so this page server-renders its full chrome instead of flashing a loading
  // state, and both browsers look and behave the same.
  const templates = loadComplianceTemplates();

  return (
    <div className="max-w-[1600px] mx-auto">
      <Suspense fallback={<div role="status" className="p-6 text-fluent-text-secondary">Loading catalog...</div>}>
        <ComplianceBrowser templates={templates} />
      </Suspense>
    </div>
  );
}
