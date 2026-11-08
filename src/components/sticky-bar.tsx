"use client";

import { useLayoutEffect, useRef } from "react";

/**
 * Pins its content under the app header while the page scrolls, and publishes its height as
 * --sticky-bar-h so other sticky elements (e.g. a side column) can sit right below it.
 */
export function StickyBar({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const root = document.documentElement.style;
    const ro = new ResizeObserver(() => root.setProperty("--sticky-bar-h", `${el.offsetHeight}px`));
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.removeProperty("--sticky-bar-h");
    };
  }, []);
  return (
    // Same colour as the page behind it (bg-muted/30 over the background), but opaque. The negative top margin
    // cancels the page's top padding so the bar starts where it sticks and never shifts when scrolling begins.
    <div
      ref={ref}
      className="sticky top-[calc(3.5rem+1px)] z-20 -mx-4 -mt-8 mb-6 border-b bg-[color-mix(in_oklab,var(--color-muted)_30%,var(--color-background))] px-4 pt-6 pb-4"
    >
      {children}
    </div>
  );
}
