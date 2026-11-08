"use client";

import { FileText } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";

const PX_PER_MM = 96 / 25.4;
// Space above and below the sticky preview on large screens: header + label above, a gap below.
const VIEWPORT_CHROME = 80 + 28 + 24;

/**
 * A printed-page template scaled down to fit its column, with an estimated page count.
 * On large screens a one-page document is also scaled to fit the window and stays in view while the form
 * scrolls, so there is never a second scrollbar; longer documents simply scroll with the page.
 * Defaults match the cover letter (A4, 13mm margins).
 */
export function ScaledPage({
  children,
  widthMm = 210,
  heightMm = 297,
  marginMm = 13,
}: {
  children: React.ReactNode;
  widthMm?: number;
  heightMm?: number;
  marginMm?: number;
}) {
  const PAGE_WIDTH = widthMm * PX_PER_MM;
  const PRINTABLE_PAGE_HEIGHT = (heightMm - 2 * marginMm) * PX_PER_MM;
  const SCREEN_TOP_PADDING = marginMm * PX_PER_MM;
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [viewport, setViewport] = useState<number>();
  const [height, setHeight] = useState(1123);
  const [contentHeight, setContentHeight] = useState(0);

  // Window height on large screens only; below lg the preview sits under the form at full width.
  useLayoutEffect(() => {
    const lg = window.matchMedia("(min-width: 1024px)");
    const update = () => setViewport(lg.matches ? window.innerHeight : undefined);
    update();
    window.addEventListener("resize", update);
    lg.addEventListener("change", update);
    return () => {
      window.removeEventListener("resize", update);
      lg.removeEventListener("change", update);
    };
  }, []);

  useLayoutEffect(() => {
    const ro = new ResizeObserver(() => {
      if (outer.current) setWidth(outer.current.clientWidth);
      if (!inner.current) return;
      setHeight(inner.current.offsetHeight);
      // Measure the content, not the page (which has a one-page minimum height).
      const article = inner.current.querySelector("article");
      const last = article?.lastElementChild as HTMLElement | null;
      if (article && last) {
        // getBoundingClientRect is in scaled pixels; convert back to page pixels with the scale on screen.
        const shown = inner.current.getBoundingClientRect().width / PAGE_WIDTH;
        setContentHeight((last.getBoundingClientRect().bottom - article.getBoundingClientRect().top) / shown);
      }
    });
    if (outer.current) ro.observe(outer.current);
    if (inner.current) ro.observe(inner.current);
    return () => ro.disconnect();
  }, [PAGE_WIDTH]);

  const widthScale = width ? Math.min(1, width / PAGE_WIDTH) : 0.6;
  const pages = Math.max(1, Math.ceil((contentHeight - SCREEN_TOP_PADDING) / PRINTABLE_PAGE_HEIGHT));
  const fitsWindow = viewport !== undefined && pages === 1;
  // offsetHeight ignores the transform, so `height` is already in page pixels.
  const scale = fitsWindow ? Math.min(widthScale, (viewport - VIEWPORT_CHROME) / height) : widthScale;

  return (
    <div ref={outer} className={fitsWindow ? "sticky top-20 self-start" : undefined}>
      <p className={`mb-2 flex items-center gap-1.5 text-sm ${pages > 2 ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground"}`}>
        <FileText className="size-4" />
        Preview · about {pages} page{pages > 1 ? "s" : ""}
        {pages > 2 && " (recruiters prefer 1–2)"}
      </p>
      <div
        className="mx-auto overflow-hidden rounded-lg shadow-sm ring-1 ring-foreground/10"
        style={{ width: PAGE_WIDTH * scale }}
      >
        <div style={{ height: height * scale }}>
          <div ref={inner} style={{ transform: `scale(${scale})`, transformOrigin: "top left", width: PAGE_WIDTH }}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
