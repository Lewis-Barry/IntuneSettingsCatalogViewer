import type { Metadata } from 'next';
import OIBBrowser from '@/components/OIBBrowser';

export const metadata: Metadata = {
  title: 'OIB Lookup | Intune Settings Catalog Viewer',
  description:
    'Browse OpenIntuneBaseline policies — see exactly which settings are configured and how. Search across Windows, macOS and Windows 365 baselines.',
};

export const dynamic = 'force-static';

export default function BaselinePage() {
  return (
    <div className="max-w-[1600px] mx-auto">
      <OIBBrowser />
    </div>
  );
}
