import Link from 'next/link';
import { basePath } from '@/lib/basePath';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'I ♥ Windows Pro | Intune Settings Catalog Viewer',
  description:
    'Settings available on Windows Enterprise but not Windows Professional — discover what Enterprise licenses unlock in the Intune Settings Catalog.',
};

export const dynamic = 'force-static';

export default function ProExclusivePage() {
  const href = '/?platform=windows10&compatibility=enterprise-only';
  return (
    <>
      <meta httpEquiv="refresh" content={`0;url=${basePath}${href}`} />
      <p className="p-6"><Link href={href} className="text-fluent-blue underline">Enterprise-only settings</Link></p>
    </>
  );
}
