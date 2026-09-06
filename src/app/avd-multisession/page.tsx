import Link from 'next/link';
import { basePath } from '@/lib/basePath';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'AVD Multi-Session | Intune Settings Catalog Viewer',
  description:
    'Settings Catalog policies available on Windows Enterprise multi-session — the Azure Virtual Desktop (AVD) SKU.',
};

export const dynamic = 'force-static';

export default function AvdMultiSessionPage() {
  const href = '/?platform=windows10&compatibility=avd-multisession';
  return (
    <>
      <meta httpEquiv="refresh" content={`0;url=${basePath}${href}`} />
      <p className="p-6"><Link href={href} className="text-fluent-blue underline">AVD multi-session settings</Link></p>
    </>
  );
}
