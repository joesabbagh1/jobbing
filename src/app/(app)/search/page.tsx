import { asc } from "drizzle-orm";
import { AlertTriangle, CircleAlert, Loader2, Play, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { SubmitButton } from "@/components/submit-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getDb } from "@/db";
import { companies } from "@/db/schema";
import { isAiConfigured } from "@/lib/ai/deepseek";
import { startSearch } from "@/lib/search/actions";
import { seedCompanies } from "@/lib/search/companies";
import { getSearchProfile } from "@/lib/search/profile";
import { getLastSearch, isSearchRunning } from "@/lib/search/run";
import { cn } from "@/lib/utils";
import { AddCompanyForm, AutoRefresh, CompanyActions, ProfileForm } from "./forms";

export const dynamic = "force-dynamic";

const ATS_LABELS: Record<string, string> = {
  lever: "Lever",
  ashby: "Ashby",
  greenhouse: "Greenhouse",
  smartrecruiters: "SmartRecruiters",
  workable: "Workable",
};

export default function SearchPage() {
  const db = getDb();
  seedCompanies(db);
  const running = isSearchRunning();
  const last = getLastSearch(db);
  const profile = getSearchProfile(db);
  const boards = db.select().from(companies).orderBy(asc(companies.name)).all();
  const active = boards.filter((b) => b.enabled).length;

  return (
    <div className="space-y-6">
      <AutoRefresh active={running} />
      <PageHeader
        title="Search"
        description="Checks every company board below and LinkedIn, filters by your keywords, then has DeepSeek score each new match. Runs every 6 hours while the app is open."
        actions={
          <form action={startSearch}>
            <SubmitButton disabled={running} pendingLabel="Starting…" className="h-9">
              {running ? <Loader2 className="animate-spin" /> : <Play />}
              {running ? "Searching…" : "Run search now"}
            </SubmitButton>
          </form>
        }
      />

      {!isAiConfigured() && (
        <div className="flex gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p>
            DeepSeek isn&apos;t connected (<code className="font-mono">DEEPSEEK_API_KEY</code> in{" "}
            <code className="font-mono">.env.local</code>). Automatic searches are paused; a manual run adds every keyword
            match without a score.
          </p>
        </div>
      )}

      {last && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Stat
            label="Positions checked"
            value={last.postings}
            note={
              [
                last.linkedin && `${last.linkedin.toLocaleString()} seen on LinkedIn`,
                last.jeanMichel && `${last.jeanMichel.toLocaleString()} on Jean-Michel.io`,
              ]
                .filter(Boolean)
                .join(", ") || undefined
            }
          />
          <Stat label="Matched filters" value={last.matchedFilters} />
          <Stat label="Added" value={last.added} highlight />
          <Stat label="Rejected by AI" value={last.aiEnabled ? last.rejectedByAi : "—"} />
          <div className="col-span-2 flex flex-col justify-center rounded-xl border bg-card px-4 py-3 text-sm md:col-span-1">
            <span className="text-muted-foreground">Last run</span>
            <span className="font-medium">
              {last.finishedAt
                ? new Date(last.finishedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
                : "Interrupted"}
            </span>
            {last.errors.length > 0 && (
              <Tooltip>
                <TooltipTrigger className="flex w-fit items-center gap-1 text-xs text-destructive">
                  <CircleAlert className="size-3.5" />
                  {last.errors.length} error{last.errors.length > 1 ? "s" : ""}
                </TooltipTrigger>
                <TooltipContent className="max-w-sm">
                  <ul className="space-y-1">
                    {last.errors.map((e) => (
                      <li key={e}>{e}</li>
                    ))}
                  </ul>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>
      )}

      {last?.discovered && last.discovered.length > 0 && (
        <div className="flex gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-800 dark:text-emerald-300">
          <Sparkles className="mt-0.5 size-4 shrink-0" />
          <p>
            Found on LinkedIn and added to your boards: <span className="font-medium">{last.discovered.join(", ")}</span>.
            Their jobs now come straight from their career sites.
          </p>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Your profile</CardTitle>
          <CardDescription>What the search looks for and how jobs are scored.</CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileForm profile={profile} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Company boards</CardTitle>
          <CardDescription>
            {active} of {boards.length} active. Add any company that uses Lever, Ashby, Greenhouse, SmartRecruiters or
            Workable by pasting its careers page.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <AddCompanyForm />
          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="px-4">Company</TableHead>
                  <TableHead className="px-4">Board</TableHead>
                  <TableHead className="px-4 text-right">Open positions</TableHead>
                  <TableHead className="px-4">Last checked</TableHead>
                  <TableHead className="w-28 px-4 text-right">Active</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {boards.map((c) => (
                  <TableRow key={c.id} className={cn(!c.enabled && "text-muted-foreground")}>
                    <TableCell className="px-4 font-medium">
                      {c.name}
                      {c.discoveredFrom === "linkedin" && (
                        <Badge variant="outline" className="ml-2 font-normal text-muted-foreground">
                          via LinkedIn
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="px-4">
                      <Badge variant="secondary" className="font-normal">
                        {ATS_LABELS[c.ats] ?? c.ats}
                      </Badge>
                      <span className="ml-2 text-xs text-muted-foreground">{c.slug}</span>
                    </TableCell>
                    <TableCell className="px-4 text-right tabular-nums">{c.lastJobCount ?? "—"}</TableCell>
                    <TableCell className="px-4">
                      {c.lastError ? (
                        <Tooltip>
                          <TooltipTrigger className="flex items-center gap-1 text-destructive">
                            <CircleAlert className="size-3.5" />
                            Error
                          </TooltipTrigger>
                          <TooltipContent className="max-w-sm">{c.lastError}</TooltipContent>
                        </Tooltip>
                      ) : (
                        <span className="text-muted-foreground">
                          {c.lastCheckedAt
                            ? new Date(c.lastCheckedAt.replace(" ", "T") + "Z").toLocaleString(undefined, {
                                dateStyle: "short",
                                timeStyle: "short",
                              })
                            : "Never"}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="px-4">
                      <CompanyActions id={c.id} name={c.name} enabled={c.enabled} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({
  label,
  value,
  highlight,
  note,
}: {
  label: string;
  value: number | string;
  highlight?: boolean;
  note?: string;
}) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3">
      <div className={cn("text-2xl font-semibold tabular-nums", highlight && "text-emerald-700 dark:text-emerald-400")}>
        {typeof value === "number" ? value.toLocaleString() : value}
      </div>
      <div className="text-xs text-muted-foreground">{label}</div>
      {note && <div className="text-xs text-muted-foreground">{note}</div>}
    </div>
  );
}
