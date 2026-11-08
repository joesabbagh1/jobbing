"use client";

import { CalendarIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const toDate = (iso: string) => (iso ? new Date(`${iso}T12:00:00`) : undefined);
const toIso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Calendar popover. `value` is YYYY-MM-DD; with `name` it also posts that value in a plain <form>. */
export function DatePicker({
  name,
  defaultValue = "",
  onChange,
  placeholder = "Pick a date",
  className,
}: {
  name?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const set = (v: string) => {
    setValue(v);
    onChange?.(v);
  };
  const date = toDate(value);

  return (
    <div className={cn("flex items-center gap-1", className)}>
      {name && <input type="hidden" name={name} value={value} />}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              type="button"
              variant="outline"
              className={cn("flex-1 justify-start font-normal", !date && "text-muted-foreground")}
            />
          }
        >
          <CalendarIcon />
          {date ? date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : placeholder}
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={date}
            defaultMonth={date}
            onSelect={(d) => {
              if (d) set(toIso(d));
              setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
      {value && (
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Clear date" onClick={() => set("")}>
          <XIcon />
        </Button>
      )}
    </div>
  );
}
