import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { StickyBar } from "./sticky-bar";

/**
 * Consistent page title block: optional back link, title, description and actions on the right.
 * `sticky` keeps it pinned under the app header while the page scrolls.
 */
export function PageHeader({
  title,
  description,
  back,
  actions,
  sticky,
  children,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  back?: { href: string; label: string };
  actions?: React.ReactNode;
  sticky?: boolean;
  children?: React.ReactNode;
}) {
  const content = (
    <div className={sticky ? "space-y-2" : "mb-6 space-y-2"}>
      {back && (
        <Link
          href={back.href}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
          {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {description && <div className="text-sm text-muted-foreground">{description}</div>}
          {children}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
  return sticky ? <StickyBar>{content}</StickyBar> : content;
}
