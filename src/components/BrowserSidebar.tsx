'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

const MIN_SIDEBAR = 200;
const MAX_SIDEBAR = 600;

/**
 * Sidebar open/width/resize state shared by the catalog and OIB browsers.
 * On first client render the drawer is closed on mobile, then React takes over.
 */
export function useBrowserSidebar() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(320);
  const [sidebarHydrated, setSidebarHydrated] = useState(false);
  const isResizing = useRef(false);

  // We check window.matchMedia directly because the useIsDesktop hook hasn't
  // updated its state yet when this first effect fires (stale closure).
  useEffect(() => {
    const isMobile = !window.matchMedia('(min-width: 768px)').matches;
    if (isMobile) setSidebarOpen(false);
    setSidebarHydrated(true);
  }, []);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizing.current = true;
    const startX = e.clientX;
    const startWidth = sidebarWidth;

    const onMouseMove = (ev: MouseEvent) => {
      if (!isResizing.current) return;
      setSidebarWidth(Math.min(MAX_SIDEBAR, Math.max(MIN_SIDEBAR, startWidth + ev.clientX - startX)));
    };
    const onMouseUp = () => {
      isResizing.current = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [sidebarWidth]);

  return { sidebarOpen, setSidebarOpen, sidebarWidth, sidebarHydrated, handleResizeStart };
}

interface BrowserSidebarProps {
  isDesktop: boolean;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  sidebarWidth: number;
  sidebarHydrated: boolean;
  handleResizeStart: (e: React.MouseEvent) => void;
  /** Sidebar contents (category/policy tree). */
  sidebarBody: React.ReactNode;
  /** Main content panel rendered beside the sidebar. */
  children: React.ReactNode;
}

/**
 * Sidebar shell: mobile FAB + backdrop + drawer/inline aside + desktop resize
 * handle. Used by both the Settings Catalog and OIB browsers.
 */
export default function BrowserSidebar({
  isDesktop,
  sidebarOpen,
  setSidebarOpen,
  sidebarWidth,
  sidebarHydrated,
  handleResizeStart,
  sidebarBody,
  children,
}: BrowserSidebarProps) {
  return (
    <>
      {/* Mobile sidebar toggle FAB */}
      {!isDesktop && !sidebarOpen && (
        <button
          onClick={() => setSidebarOpen(true)}
          className="fixed bottom-6 left-4 z-50 w-12 h-12 rounded-full bg-fluent-blue text-white dark:text-[#1c1c1e] shadow-lg flex items-center justify-center hover:bg-fluent-blue-hover active:bg-fluent-blue-pressed transition-colors"
          aria-label="Open categories"
          title="Browse categories"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h7" />
          </svg>
        </button>
      )}

      {/* Mobile sidebar backdrop */}
      {!isDesktop && sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 transition-opacity"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Main content: sidebar + panel */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Category sidebar — drawer on mobile, inline on desktop */}
        <aside
          className={`${!sidebarHydrated ? 'sidebar-mobile-init ' : ''}${
            isDesktop
              ? 'flex-shrink-0 border-r border-fluent-border bg-white dark:bg-[#1c1c1e] overflow-hidden transition-all duration-200'
              : `fixed inset-y-0 left-0 z-50 w-[85vw] max-w-[360px] bg-white dark:bg-[#1c1c1e] shadow-2xl transition-transform duration-300 ease-in-out ${
                  sidebarOpen ? 'translate-x-0' : '-translate-x-full'
                }`
          }`}
          style={isDesktop ? { width: sidebarOpen ? sidebarWidth : 0 } : undefined}
        >
          {/* Mobile drawer header */}
          {!isDesktop && (
            <div className="flex items-center justify-between px-4 py-3 border-b border-fluent-border bg-fluent-bg-alt">
              <span className="text-fluent-base font-semibold">Categories</span>
              <button
                onClick={() => setSidebarOpen(false)}
                className="w-10 h-10 flex items-center justify-center rounded-md hover:bg-fluent-bg text-fluent-text-secondary hover:text-fluent-text transition-colors"
                aria-label="Close categories"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}
          <div className="h-full overflow-y-auto fluent-scroll py-2" style={isDesktop ? { minWidth: MIN_SIDEBAR } : undefined}>
            {sidebarBody}
          </div>
        </aside>

        {/* Desktop resize handle + toggle */}
        {isDesktop && (
          <div className={`flex-shrink-0 flex flex-col relative${!sidebarHydrated ? ' sidebar-mobile-init' : ''}`}>
            {sidebarOpen && (
              <div
                className="absolute inset-y-0 -left-1 w-2 cursor-col-resize z-20 group"
                onMouseDown={handleResizeStart}
                title="Drag to resize sidebar"
              >
                <div className="absolute inset-y-0 left-[3px] w-px bg-transparent group-hover:bg-fluent-blue transition-colors" />
              </div>
            )}
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="flex-shrink-0 w-8 h-full flex items-center justify-center bg-fluent-bg hover:bg-fluent-bg-alt border-r border-fluent-border transition-colors"
              aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
              title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
            >
              <svg
                className={`w-3.5 h-3.5 text-fluent-text-secondary transition-transform ${sidebarOpen ? '' : 'rotate-180'}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          </div>
        )}

        {children}
      </div>
    </>
  );
}
