"use client";

import { X } from "lucide-react";
import { useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Chips with a text box: Enter or comma adds, Backspace on an empty box removes the last one.
 * Posts its values as one comma-separated field named `name`.
 */
export function TagInput({
  name,
  defaultValue = [],
  placeholder = "Add…",
  className,
}: {
  name: string;
  defaultValue?: string[];
  placeholder?: string;
  className?: string;
}) {
  const [tags, setTags] = useState(defaultValue);
  const [draft, setDraft] = useState("");
  const input = useRef<HTMLInputElement>(null);

  const add = (raw: string) => {
    const parts = raw
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    if (parts.length) setTags((t) => [...t, ...parts.filter((p) => !t.some((x) => x.toLowerCase() === p.toLowerCase()))]);
    setDraft("");
  };

  return (
    <div
      onClick={() => input.current?.focus()}
      className={cn(
        "flex min-h-9 w-full cursor-text flex-wrap items-center gap-1.5 rounded-lg border border-input bg-transparent px-2 py-1.5 text-sm transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30",
        className,
      )}
    >
      <input type="hidden" name={name} value={tags.join(",")} />
      {tags.map((t) => (
        <span key={t} className="inline-flex items-center gap-1 rounded-md bg-secondary py-0.5 pr-1 pl-2 text-xs font-medium">
          {t}
          <button
            type="button"
            aria-label={`Remove ${t}`}
            onClick={(e) => {
              e.stopPropagation();
              setTags((all) => all.filter((x) => x !== t));
            }}
            className="rounded p-0.5 text-muted-foreground hover:bg-background hover:text-foreground"
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
      <input
        ref={input}
        value={draft}
        onChange={(e) => (e.target.value.includes(",") ? add(e.target.value) : setDraft(e.target.value))}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add(draft);
          } else if (e.key === "Backspace" && !draft && tags.length) {
            setTags((t) => t.slice(0, -1));
          }
        }}
        onBlur={() => draft && add(draft)}
        placeholder={tags.length ? "" : placeholder}
        className="min-w-24 flex-1 bg-transparent py-0.5 outline-none placeholder:text-muted-foreground"
      />
    </div>
  );
}
