import type { Metadata } from 'next';
import BaselineBrowser from '@/components/BaselineBrowser';

export const metadata: Metadata = {
  title: 'Microsoft Security Baselines | Intune Settings Catalog Viewer',
  description:
    'Browse Microsoft Intune security baseline templates — every setting and its recommended default value, for every published baseline version.',
};

export const dynamic = 'force-static';

export default function BaselinesPage() {
  return (
    <div className="max-w-[1600px] mx-auto">
      <BaselineBrowser />
    </div>
  );
}
