"use client";

import { Dialog } from "@base-ui/react/dialog";
import { Eye, ExternalLink, Loader2, X } from "lucide-react";
import { useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";

/** Opens a PDF route in a modal for a quick look, with a link to open it in a new tab. */
export function PdfPreview({ src, title }: { src: string; title: string }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <Dialog.Root onOpenChange={(open) => !open && setLoaded(false)}>
      <Dialog.Trigger
        render={
          <Button size="sm" variant="outline">
            <Eye />
            Preview
          </Button>
        }
      />
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 isolate z-50 bg-black/40 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 flex h-[90vh] w-[calc(100%-2rem)] max-w-4xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl bg-popover text-popover-foreground ring-1 ring-foreground/10 duration-100 outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95">
          <div className="flex items-center gap-2 border-b px-4 py-2.5">
            <Dialog.Title className="flex-1 truncate text-sm font-medium">{title}</Dialog.Title>
            <a href={src} target="_blank" rel="noreferrer" className={buttonVariants({ size: "sm", variant: "outline" })}>
              <ExternalLink />
              Open in new tab
            </a>
            <Dialog.Close render={<Button size="icon-sm" variant="ghost" aria-label="Close" />}>
              <X />
            </Dialog.Close>
          </div>
          <div className="relative flex-1 bg-muted">
            {!loaded && (
              <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Rendering PDF…
              </div>
            )}
            <iframe src={src} title={title} onLoad={() => setLoaded(true)} className="relative size-full" />
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
