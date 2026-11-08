"use client";

import { BriefcaseBusiness, FileUser, Map, Search } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/", label: "Jobs", icon: BriefcaseBusiness, match: (p: string) => p === "/" || p.startsWith("/jobs") },
  { href: "/map", label: "Map", icon: Map, match: (p: string) => p.startsWith("/map") },
  { href: "/search", label: "Search", icon: Search, match: (p: string) => p.startsWith("/search") },
  { href: "/cv", label: "My CV", icon: FileUser, match: (p: string) => p.startsWith("/cv") },
];

export function MainNav() {
  const pathname = usePathname();
  return (
    <nav className="flex items-center gap-1 text-sm">
      {LINKS.map(({ href, label, icon: Icon, match }) => (
        <Link
          key={href}
          href={href}
          aria-label={label}
          className={cn(
            "flex items-center gap-2 rounded-md px-3 py-1.5 font-medium transition-colors",
            match(pathname) ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Icon className="size-4" />
          {/* Icons only on phones, where four labels don't fit beside the logo. */}
          <span className="hidden sm:inline">{label}</span>
        </Link>
      ))}
    </nav>
  );
}
