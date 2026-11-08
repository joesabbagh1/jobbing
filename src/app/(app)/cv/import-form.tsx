"use client";

import { FileUp, Loader2, Upload } from "lucide-react";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { importCv, startBlankCv } from "@/lib/cv/actions";
import { cn } from "@/lib/utils";

export function ImportForm({ replacing }: { replacing?: boolean }) {
  const [state, action, pending] = useActionState(importCv, {});
  const [fileName, setFileName] = useState<string>();
  const [dragging, setDragging] = useState(false);
  const [pasting, setPasting] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Import your CV</CardTitle>
        <CardDescription>
          DeepSeek splits your PDF into sections, copying your wording as-is. You can then fix anything it got wrong.
          {replacing && " This replaces your current master CV; tailored CVs are not affected."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="space-y-4">
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={() => setDragging(false)}
            className={cn(
              "relative flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors hover:bg-muted/50",
              dragging && "border-primary bg-muted/50",
            )}
          >
            <span className="flex size-10 items-center justify-center rounded-full bg-muted">
              <FileUp className="size-5 text-muted-foreground" />
            </span>
            {fileName ? (
              <span className="font-medium">{fileName}</span>
            ) : (
              <>
                <span className="font-medium">Drop your CV here, or click to choose</span>
                <span className="text-xs text-muted-foreground">PDF, up to 10 MB</span>
              </>
            )}
            <input
              type="file"
              name="file"
              accept="application/pdf,.pdf"
              className="absolute inset-0 cursor-pointer opacity-0"
              onChange={(e) => setFileName(e.target.files?.[0]?.name)}
            />
          </label>

          {pasting ? (
            <Textarea name="text" placeholder="Paste the full text of your CV…" className="min-h-48" />
          ) : (
            <button
              type="button"
              onClick={() => setPasting(true)}
              className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              No PDF? Paste the text instead
            </button>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : <Upload />}
              {pending ? "Reading your CV…" : "Import"}
            </Button>
            {!replacing && (
              <Button type="submit" variant="ghost" formAction={startBlankCv} formNoValidate disabled={pending}>
                Start from a blank CV
              </Button>
            )}
          </div>
          {state.error && <p className="text-sm text-destructive">{state.error}</p>}
        </form>
      </CardContent>
    </Card>
  );
}
