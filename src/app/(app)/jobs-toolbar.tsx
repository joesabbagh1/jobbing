"use client";

import { BellRing, Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { AppSelect, type Option } from "@/components/app-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Search box + filter/group dropdowns. Everything is written to the URL, which the server page reads. */
export function JobsToolbar({ match, origin, groups }: { match: Option[]; origin: Option[]; groups: Option[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(params.get("q") ?? "");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    startTransition(() => router.replace(next.size ? `${pathname}?${next}` : pathname, { scroll: false }));
  };

  // Debounce typing so every keystroke doesn't hit the server.
  const setRef = useRef(set);
  setRef.current = set;
  const urlQ = params.get("q") ?? "";
  const pushed = useRef(urlQ);
  useEffect(() => {
    if (q.trim() === urlQ) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      pushed.current = q.trim();
      setRef.current("q", q.trim());
    }, 300);
    return () => clearTimeout(timer.current);
  }, [q, urlQ]);

  // The URL changed from elsewhere (e.g. "clear filters", back button): show that instead of the typed text.
  useEffect(() => {
    if (urlQ !== pushed.current) {
      pushed.current = urlQ;
      setQ(urlQ);
    }
  }, [urlQ]);

  // "/" focuses the search box, like many apps.
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = document.activeElement?.tagName;
      if (e.key === "/" && tag !== "INPUT" && tag !== "TEXTAREA") {
        e.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const due = params.get("due") === "1";

  return (
    <div className={cn("flex flex-wrap items-center gap-2 transition-opacity", pending && "opacity-70")}>
      <div className="relative min-w-64 flex-1">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={input}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search title, company, location, description…"
          className="h-9 bg-background pr-9 pl-8"
        />
        {q ? (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => setQ("")}
            className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        ) : (
          <kbd className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 rounded border bg-muted px-1.5 font-mono text-[10px] text-muted-foreground">
            /
          </kbd>
        )}
      </div>
      <AppSelect
        aria-label="Match"
        options={match}
        emptyLabel="Any match"
        value={params.get("match") ?? ""}
        onValueChange={(v) => set("match", v)}
        className="h-9 bg-background"
      />
      <AppSelect
        aria-label="Source"
        options={origin}
        emptyLabel="Any source"
        value={params.get("origin") ?? ""}
        onValueChange={(v) => set("origin", v)}
        className="h-9 bg-background"
      />
      <AppSelect
        aria-label="Description"
        options={[
          { value: "yes", label: "Has description" },
          { value: "no", label: "No description" },
        ]}
        emptyLabel="Any description"
        value={params.get("jd") ?? ""}
        onValueChange={(v) => set("jd", v)}
        className="h-9 bg-background"
      />
      <Button
        variant="outline"
        aria-pressed={due}
        onClick={() => set("due", due ? "" : "1")}
        className={cn(
          "h-9 bg-background",
          due && "border-amber-500/60 bg-amber-500/10 text-amber-700 hover:bg-amber-500/15 dark:text-amber-400",
        )}
      >
        <BellRing />
        Follow-up due
      </Button>
      <AppSelect
        aria-label="Group by"
        options={groups}
        emptyLabel="No grouping"
        value={params.get("group") ?? ""}
        onValueChange={(v) => set("group", v)}
        className="h-9 bg-background"
      />
    </div>
  );
}
