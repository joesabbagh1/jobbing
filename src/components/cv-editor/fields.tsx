"use client";

import { ArrowDown, ArrowUp, Eye, EyeOff, Trash2 } from "lucide-react";
import { ConfirmAction } from "@/components/confirm-action";
import { IconButton } from "@/components/icon-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export function Field({
  label,
  value,
  onChange,
  placeholder,
  multiline,
  className,
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1", className)}>
      {label && <Label className="text-xs font-normal text-muted-foreground">{label}</Label>}
      {multiline ? (
        <AutoTextarea value={value} onChange={onChange} placeholder={placeholder} />
      ) : (
        <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      )}
    </div>
  );
}

/** Textarea that grows with its content. */
export function AutoTextarea({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <Textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={cn("min-h-9 resize-none", className)}
    />
  );
}

/** Move / hide / delete controls shared by every list item. */
export function ItemControls({
  index,
  count,
  hidden,
  onMove,
  onToggleHidden,
  onRemove,
}: {
  index: number;
  count: number;
  hidden?: boolean;
  onMove: (delta: -1 | 1) => void;
  onToggleHidden?: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center">
      <IconButton label="Move up" disabled={index === 0} onClick={() => onMove(-1)}>
        <ArrowUp />
      </IconButton>
      <IconButton label="Move down" disabled={index === count - 1} onClick={() => onMove(1)}>
        <ArrowDown />
      </IconButton>
      {onToggleHidden && (
        <IconButton label={hidden ? "Show on CV" : "Hide from CV (kept here)"} onClick={onToggleHidden}>
          {hidden ? <EyeOff /> : <Eye />}
        </IconButton>
      )}
      <ConfirmAction
        title="Delete this item?"
        description="It's removed from this CV. To keep it for other jobs, hide it instead."
        confirmLabel="Delete"
        onConfirm={onRemove}
        trigger={
          <IconButton label="Delete" className="hover:text-destructive">
            <Trash2 />
          </IconButton>
        }
      />
    </div>
  );
}

export function move<T>(list: T[], index: number, delta: -1 | 1): T[] {
  const to = index + delta;
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  [next[index], next[to]] = [next[to], next[index]];
  return next;
}
