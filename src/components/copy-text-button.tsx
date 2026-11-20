"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Copies plain text (e.g. a cover letter, to paste into an application form) and confirms it briefly. */
export function CopyTextButton({ text, label = "Copy text", size = "sm" }: { text: string; label?: string; size?: "sm" | "default" }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size={size}
      variant="outline"
      className="bg-background"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <Check /> : <Copy />}
      {copied ? "Copied" : label}
    </Button>
  );
}
