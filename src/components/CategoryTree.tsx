'use client';

import { useState, useCallback, memo } from 'react';
import type { CategoryTreeNode } from '@/lib/types';

interface CategoryTreeProps {
  categories: CategoryTreeNode[];
  selectedCategoryId: string | null;
  onSelectCategory: (categoryId: string, categoryName: string) => void;
}

export default memo(function CategoryTree({
  categories,
  selectedCategoryId,
  onSelectCategory,
}: CategoryTreeProps) {
  return (
    <div className="fluent-scroll overflow-y-auto">
      <h3 className="px-2 py-2 text-fluent-sm font-semibold text-fluent-text-secondary uppercase tracking-wide">
        Browse by category
      </h3>
      <div className="space-y-0.5">
        {categories.map((cat) => (
          <CategoryNode
            key={cat.id}
            node={cat}
            depth={0}
            selectedCategoryId={selectedCategoryId}
            onSelectCategory={onSelectCategory}
          />
        ))}
      </div>
    </div>
  );
});

interface CategoryNodeProps {
  node: CategoryTreeNode;
  depth: number;
  selectedCategoryId: string | null;
  onSelectCategory: (categoryId: string, categoryName: string) => void;
}

const CategoryNode = memo(function CategoryNode({
  node,
  depth,
  selectedCategoryId,
  onSelectCategory,
}: CategoryNodeProps) {
  const [expanded, setExpanded] = useState(false);
  const hasChildren = node.children.length > 0;
  const isSelected = node.id === selectedCategoryId;

  const handleClick = useCallback(() => {
    onSelectCategory(node.id, node.displayName);
  }, [node.id, node.displayName, onSelectCategory]);

  const handleToggle = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setExpanded((prev) => !prev);
    },
    []
  );

  return (
    <div>
      <button
        type="button"
        className={`category-item ${isSelected ? 'category-item-active' : ''}`}
        style={{ paddingLeft: `${8 + depth * 16}px` }}
        onClick={handleClick}
        role="treeitem"
        aria-expanded={hasChildren ? expanded : undefined}
        aria-selected={isSelected}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleClick();
          }
          if (e.key === 'ArrowRight' && hasChildren && !expanded) {
            e.preventDefault();
            setExpanded(true);
          }
          if (e.key === 'ArrowLeft' && expanded) {
            e.preventDefault();
            setExpanded(false);
          }
        }}
      >
        {/* Expand/collapse chevron */}
        {hasChildren ? (
          <span
            onClick={handleToggle}
            className="w-4 h-4 flex items-center justify-center flex-shrink-0 text-fluent-text-secondary hover:text-fluent-text"
            aria-hidden="true"
          >
            <svg
              className={`w-3 h-3 transition-transform duration-150 ${expanded ? 'rotate-90' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </span>
        ) : (
          <span className="w-4 h-4 flex-shrink-0" />
        )}

        {/* Category name */}
        <span className="flex-1 truncate text-fluent-base">
          {node.displayName}
        </span>

        {/* Setting count badge */}
        {node.settingCount > 0 && (
          <span className="text-fluent-xs text-fluent-text-secondary ml-1 flex-shrink-0">
            {node.settingCount.toLocaleString()}
          </span>
        )}
      </button>

      {/* Children */}
      {hasChildren && expanded && (
        <div role="group">
          {node.children.map((child) => (
            <CategoryNode
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedCategoryId={selectedCategoryId}
              onSelectCategory={onSelectCategory}
            />
          ))}
        </div>
      )}
    </div>
  );
});
