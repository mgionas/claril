"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

interface PageHeaderState {
  title?: string;
  actions?: ReactNode;
}

const PageHeaderContext = createContext<{
  header: PageHeaderState | null;
  setHeader: (h: PageHeaderState | null) => void;
} | null>(null);

/** Holds the per-page header override (title/actions) for the persistent app frame. */
export function PageHeaderProvider({ children }: { children: ReactNode }) {
  const [header, setHeader] = useState<PageHeaderState | null>(null);
  return (
    <PageHeaderContext.Provider value={{ header, setHeader }}>{children}</PageHeaderContext.Provider>
  );
}

export function usePageHeader(): PageHeaderState | null {
  return useContext(PageHeaderContext)?.header ?? null;
}

/**
 * Rendered by a page to override the frame header's title and/or right-aligned
 * actions. Clears itself on unmount so the next route falls back to its default.
 */
export function PageHeader({ title, actions }: PageHeaderState) {
  const setHeader = useContext(PageHeaderContext)?.setHeader;
  useEffect(() => {
    if (!setHeader) return;
    setHeader({ title, actions });
    return () => setHeader(null);
  }, [setHeader, title, actions]);
  return null;
}
