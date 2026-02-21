import { loadSettings, loadCategories, loadCategoryTree } from '@/lib/data';
import SettingsList from '@/components/SettingsList';
import Link from 'next/link';
import type { Metadata } from 'next';

interface CategoryPageProps {
  params: { id: string };
}

export async function generateStaticParams() {
  const categories = loadCategories();
  return categories.map((c) => ({
    id: c.id,
  }));
}

export async function generateMetadata({ params }: CategoryPageProps): Promise<Metadata> {
  const categories = loadCategories();
  const category = categories.find((c) => c.id === decodeURIComponent(params.id));

  if (!category) {
    return { title: 'Category Not Found' };
  }

  return {
    title: `${category.displayName} — Intune Settings Catalog`,
    description: category.description || `Intune settings in the ${category.displayName} category`,
  };
}

export default function CategoryPage({ params }: CategoryPageProps) {
  const decodedId = decodeURIComponent(params.id);
  const categories = loadCategories();
  const category = categories.find((c) => c.id === decodedId);

  if (!category) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12 text-center">
        <h1 className="text-fluent-2xl font-semibold text-fluent-text mb-2">
          Category Not Found
        </h1>
        <p className="text-fluent-base text-fluent-text-secondary mb-6">
          The category &ldquo;{decodedId}&rdquo; was not found.
        </p>
        <Link href="/" className="fluent-btn-primary">
          Back to Browse
        </Link>
      </div>
    );
  }

  // Get settings for this category and all child categories
  const allSettings = loadSettings();
  const childCatIds = new Set<string>([decodedId]);

  // Recursively collect child category IDs
  function collectChildren(parentId: string) {
    for (const c of categories) {
      if (c.parentCategoryId === parentId && c.id !== parentId) {
        childCatIds.add(c.id);
        collectChildren(c.id);
      }
    }
  }
  collectChildren(decodedId);

  const categorySettings = allSettings.filter((s) => childCatIds.has(s.categoryId));

  // Build a category map for disambiguation labels
  const categoryNameMap: Record<string, string> = {};
  for (const c of categories) {
    categoryNameMap[c.id] = c.displayName;
  }

  // Breadcrumbs
  const breadcrumbs: Array<{ name: string; id: string }> = [];
  let current = category;
  const catMap = new Map(categories.map((c) => [c.id, c]));
  const visited = new Set<string>();

  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    breadcrumbs.unshift({ name: current.displayName, id: current.id });
    if (current.parentCategoryId && current.parentCategoryId !== current.id) {
      const parent = catMap.get(current.parentCategoryId);
      if (parent) {
        current = parent;
      } else break;
    } else break;
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-1 text-fluent-sm text-fluent-text-secondary mb-4 flex-wrap">
        <Link href="/" className="hover:text-fluent-blue hover:underline">
          Home
        </Link>
        {breadcrumbs.map((bc, i) => (
          <span key={bc.id} className="flex items-center gap-1">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
            {i < breadcrumbs.length - 1 ? (
              <a
                href={`/category/${encodeURIComponent(bc.id)}/`}
                className="hover:text-fluent-blue hover:underline"
              >
                {bc.name}
              </a>
            ) : (
              <span className="text-fluent-text font-medium">{bc.name}</span>
            )}
          </span>
        ))}
      </nav>

      {/* Category header */}
      <div className="mb-4">
        <h1 className="text-fluent-2xl font-semibold text-fluent-text">
          {category.displayName}
        </h1>
        {category.description && (
          <p className="text-fluent-base text-fluent-text-secondary mt-1">
            {category.description}
          </p>
        )}
      </div>

      {/* Settings list */}
      <div className="fluent-card">
        <SettingsList
          settings={categorySettings}
          categoryName={category.displayName}
          categoryMap={categoryNameMap}
        />
      </div>

      {/* Back link */}
      <div className="mt-6">
        <Link href="/" className="fluent-btn-secondary inline-flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back to Browse
        </Link>
      </div>
    </div>
  );
}
