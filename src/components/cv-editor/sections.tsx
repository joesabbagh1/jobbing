"use client";

import { ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Cv, CvBullet } from "@/lib/cv/schema";
import { newId } from "@/lib/cv/schema";
import { cn } from "@/lib/utils";
import { AutoTextarea, Field, ItemControls, move } from "./fields";

type Item = { id: string; hidden?: boolean };

/** Collapsible card used for each CV section. */
export function SectionCard({
  title,
  count,
  defaultOpen = true,
  children,
}: {
  title: string;
  count?: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details open={defaultOpen} className="group/section rounded-xl border bg-card">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium select-none [&::-webkit-details-marker]:hidden">
        <ChevronRight className="size-4 text-muted-foreground transition-transform group-open/section:rotate-90" />
        {title}
        {count !== undefined && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{count}</span>
        )}
      </summary>
      <div className="space-y-3 border-t px-4 py-4">{children}</div>
    </details>
  );
}

function AddButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <Button type="button" variant="ghost" size="sm" onClick={onClick} className="text-muted-foreground">
      <Plus />
      {children}
    </Button>
  );
}

/** A titled, collapsible list of items with add / reorder / hide / delete. */
export function ListSection<T extends Item>({
  title,
  items,
  onChange,
  make,
  label,
  render,
  addLabel = "Add",
  defaultOpen = true,
}: {
  title: string;
  items: T[];
  onChange: (items: T[]) => void;
  make: () => T;
  label: (item: T) => string;
  render: (item: T, update: (patch: Partial<T>) => void) => React.ReactNode;
  addLabel?: string;
  defaultOpen?: boolean;
}) {
  return (
    <SectionCard title={title} count={items.filter((i) => !i.hidden).length} defaultOpen={defaultOpen}>
      {items.map((item, i) => (
        <div
          key={item.id}
          className={cn("rounded-lg border bg-background p-3 transition-opacity", item.hidden && "border-dashed opacity-60")}
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="truncate text-sm font-medium">
              {label(item) || <span className="text-muted-foreground">Untitled</span>}
              {item.hidden && <span className="ml-2 text-xs font-normal text-muted-foreground">Hidden</span>}
            </span>
            <ItemControls
              index={i}
              count={items.length}
              hidden={item.hidden}
              onMove={(d) => onChange(move(items, i, d))}
              onToggleHidden={() => onChange(items.map((x) => (x.id === item.id ? { ...x, hidden: !x.hidden } : x)))}
              onRemove={() => onChange(items.filter((x) => x.id !== item.id))}
            />
          </div>
          {render(item, (patch) => onChange(items.map((x) => (x.id === item.id ? { ...x, ...patch } : x))))}
        </div>
      ))}
      <AddButton onClick={() => onChange([...items, make()])}>{addLabel}</AddButton>
    </SectionCard>
  );
}

export function BulletsEditor({ bullets, onChange }: { bullets: CvBullet[]; onChange: (b: CvBullet[]) => void }) {
  return (
    <div className="mt-3 space-y-1.5">
      <Label className="text-xs font-normal text-muted-foreground">Bullets</Label>
      {bullets.map((b, i) => (
        <div key={b.id} className={cn("flex items-start gap-1.5", b.hidden && "opacity-50")}>
          <span className="mt-3 size-1.5 shrink-0 rounded-full bg-muted-foreground/50" />
          <AutoTextarea
            value={b.text}
            onChange={(text) => onChange(bullets.map((x) => (x.id === b.id ? { ...x, text } : x)))}
            className={cn(b.hidden && "line-through")}
          />
          <div className="pt-1">
            <ItemControls
              index={i}
              count={bullets.length}
              hidden={b.hidden}
              onMove={(d) => onChange(move(bullets, i, d))}
              onToggleHidden={() => onChange(bullets.map((x) => (x.id === b.id ? { ...x, hidden: !x.hidden } : x)))}
              onRemove={() => onChange(bullets.filter((x) => x.id !== b.id))}
            />
          </div>
        </div>
      ))}
      <AddButton onClick={() => onChange([...bullets, { id: newId(), text: "", hidden: false }])}>Bullet</AddButton>
    </div>
  );
}

export function BasicsEditor({ cv, set }: { cv: Cv; set: (cv: Cv) => void }) {
  const b = cv.basics;
  const update = (patch: Partial<Cv["basics"]>) => set({ ...cv, basics: { ...b, ...patch } });
  return (
    <SectionCard title="Header & summary">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Name" value={b.name} onChange={(name) => update({ name })} />
        <Field label="Headline" value={b.headline} onChange={(headline) => update({ headline })} placeholder="DevOps Engineer" />
        <Field label="Email" value={b.email} onChange={(email) => update({ email })} />
        <Field label="Phone" value={b.phone} onChange={(phone) => update({ phone })} />
        <Field label="Location" value={b.location} onChange={(location) => update({ location })} className="col-span-2" />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs font-normal text-muted-foreground">Links</Label>
        {b.links.map((l, i) => (
          <div key={l.id} className="flex items-center gap-1.5">
            <Input
              value={l.label}
              placeholder="LinkedIn"
              onChange={(e) => update({ links: b.links.map((x) => (x.id === l.id ? { ...x, label: e.target.value } : x)) })}
              className="w-28"
            />
            <Input
              value={l.url}
              placeholder="https://linkedin.com/in/…"
              onChange={(e) => update({ links: b.links.map((x) => (x.id === l.id ? { ...x, url: e.target.value } : x)) })}
              className="flex-1"
            />
            <ItemControls
              index={i}
              count={b.links.length}
              onMove={(d) => update({ links: move(b.links, i, d) })}
              onRemove={() => update({ links: b.links.filter((x) => x.id !== l.id) })}
            />
          </div>
        ))}
        <AddButton onClick={() => update({ links: [...b.links, { id: newId(), label: "", url: "" }] })}>Link</AddButton>
      </div>
      <Field label="Summary" multiline value={cv.summary} onChange={(summary) => set({ ...cv, summary })} />
    </SectionCard>
  );
}
