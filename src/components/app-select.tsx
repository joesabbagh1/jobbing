"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type Option = { value: string; label: string };

// Base UI needs a non-empty value for the "nothing selected" option; map it to "" for callers.
const NONE = "__none__";

/**
 * Styled select. Works controlled (`value` + `onValueChange`) or inside a plain <form> (`name` + `defaultValue`).
 * Pass `emptyLabel` to add an "Any …" option that maps to "".
 */
export function AppSelect({
  options,
  value,
  defaultValue,
  onValueChange,
  name,
  emptyLabel,
  placeholder,
  className,
  size = "default",
  "aria-label": ariaLabel,
}: {
  options: Option[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  name?: string;
  emptyLabel?: string;
  placeholder?: string;
  className?: string;
  size?: "sm" | "default";
  "aria-label"?: string;
}) {
  const all = emptyLabel ? [{ value: NONE, label: emptyLabel }, ...options] : options;
  const toInner = (v: string | undefined) => (v === undefined ? undefined : v === "" && emptyLabel ? NONE : v);
  const active = Boolean(value ?? defaultValue);

  return (
    <Select
      items={all}
      name={name}
      value={toInner(value)}
      defaultValue={toInner(defaultValue)}
      onValueChange={(v) => onValueChange?.(v === NONE || v == null ? "" : String(v))}
    >
      <SelectTrigger
        size={size}
        aria-label={ariaLabel}
        className={cn("min-w-32", emptyLabel && active && "border-foreground/40 font-medium", className)}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false} align="start">
        {all.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
