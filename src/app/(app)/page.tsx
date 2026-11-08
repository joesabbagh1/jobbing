import { and, count, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { ArrowDown, ArrowUp, ArrowUpDown, BellRing, ChevronRight, Inbox, RefreshCw, Sparkles, Send } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { ScoreBadge, STATUS_LABELS, StatusBadge, StatusDot } from "@/components/status-badge";
import { SubmitButton } from "@/components/submit-button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getDb } from "@/db";
import { applications, JOB_STATUSES, type Job, jobs, type JobStatus } from "@/db/schema";
import { getLastSync, isAirtableConfigured } from "@/lib/airtable/sync";
import { syncNow } from "@/lib/jobs/actions";
import {
  filterConditions,
  GROUPS,
  groupJobs,
  type ListParams,
  listUrl,
  MATCH_FILTERS,
  ORIGIN_LABELS,
  orderFor,
  parseListParams,
  type SortColumn,
  sortUrl,
  whereFor,
} from "@/lib/jobs/list";
import { cn } from "@/lib/utils";
import { JobsToolbar } from "./jobs-toolbar";

export const dynamic = "force-dynamic";

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = parseListParams(await searchParams);
  const today = new Date().toISOString().slice(0, 10);
  const db = getDb();

  const rows = db
    .select()
    .from(jobs)
    .where(whereFor(params, today))
    .orderBy(...orderFor(params.sort, params.dir))
    .all();
  const groups = groupJobs(rows, params.group);

  // Status tab counts respect the other filters (search, match, …) but not the status itself.
  const others = filterConditions(params, today);
  const counts = Object.fromEntries(
    db
      .select({ status: jobs.status, n: count() })
      .from(jobs)
      .where(others.length ? and(...others) : undefined)
      .groupBy(jobs.status)
      .all()
      .map((r) => [r.status, r.n]),
  ) as Partial<Record<JobStatus, number>>;
  const total = Object.values(counts).reduce((a, b) => a + (b ?? 0), 0);

  const followUps = new Map(
    db
      .select({ jobId: applications.jobId, followUpOn: applications.followUpOn })
      .from(applications)
      .all()
      .map((a) => [a.jobId, a.followUpOn]),
  );
  const n = (where: ReturnType<typeof and>) => db.select({ n: count() }).from(jobs).where(where).get()?.n ?? 0;
  const stats = {
    new: n(eq(jobs.status, "new")),
    top: n(and(gte(jobs.matchScore, 80), inArray(jobs.status, ["new", "reviewing", "ready"]))),
    applied: n(inArray(jobs.status, ["applied", "interview"])),
    due: n(
      and(
        eq(jobs.status, "applied"),
        inArray(jobs.id, sql`(select ${applications.jobId} from ${applications} where ${applications.followUpOn} <= ${today})`),
      ),
    ),
    noJd: n(and(isNull(jobs.description), inArray(jobs.status, ["new", "reviewing", "ready"]))),
  };
  const filtered = Boolean(params.q || params.status || params.match || params.origin || params.jd || params.due);
  const clear = listUrl({ ...params, q: "", status: undefined, match: undefined, origin: undefined, jd: undefined, due: false });

  return (
    <div>
      <PageHeader title="Jobs" description="Every finding from your search and the Grok bot, scored against your profile." actions={<SyncStatus />} />

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard href={listUrl(params, { status: "new" })} icon={Inbox} label="New to review" value={stats.new} />
        <StatCard
          href={listUrl({ ...params, status: undefined }, { match: "80", sort: "match" })}
          icon={Sparkles}
          label="Strong matches (80+)"
          value={stats.top}
          tone="emerald"
        />
        <StatCard href={listUrl(params, { status: "applied" })} icon={Send} label="Applied" value={stats.applied} />
        <StatCard href={listUrl(params, { due: true })} icon={BellRing} label="Follow-ups due" value={stats.due} tone={stats.due ? "amber" : undefined} />
      </div>

      <div className="space-y-4">
        <JobsToolbar
          match={Object.entries(MATCH_FILTERS).map(([value, label]) => ({ value, label }))}
          origin={Object.entries(ORIGIN_LABELS).map(([value, label]) => ({ value, label }))}
          groups={Object.entries(GROUPS).map(([value, label]) => ({ value, label }))}
        />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex flex-wrap items-center gap-1 rounded-lg bg-muted p-1 text-sm">
            <StatusTab href={listUrl(params, { status: undefined })} active={!params.status} label="All" count={total} />
            {JOB_STATUSES.map((s) => (
              <StatusTab
                key={s}
                href={listUrl(params, { status: s })}
                active={params.status === s}
                label={STATUS_LABELS[s]}
                count={counts[s] ?? 0}
                dot={<StatusDot status={s} />}
              />
            ))}
          </div>
          <div className="text-sm text-muted-foreground">
            {rows.length} job{rows.length === 1 ? "" : "s"}
            {filtered && (
              <>
                {" · "}
                <Link href={clear} className="font-medium text-foreground underline-offset-4 hover:underline">
                  Clear filters
                </Link>
              </>
            )}
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed bg-background py-16 text-center">
            <Inbox className="size-8 text-muted-foreground" />
            <p className="font-medium">{filtered ? "No jobs match these filters" : "No jobs yet"}</p>
            <p className="text-sm text-muted-foreground">
              {filtered ? (
                <Link href={clear} className="underline underline-offset-4">
                  Clear filters
                </Link>
              ) : (
                "They appear here as the search and the Grok bot find them."
              )}
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {groups.map((g) =>
              params.group ? (
                <details key={g.key} open className="group/section">
                  <summary className="mb-2 flex cursor-pointer list-none items-center gap-2 text-sm font-semibold select-none [&::-webkit-details-marker]:hidden">
                    <ChevronRight className="size-4 text-muted-foreground transition-transform group-open/section:rotate-90" />
                    {params.group === "status" ? <StatusBadge status={g.jobs[0].status} /> : <span>{g.label}</span>}
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                      {g.jobs.length}
                    </span>
                  </summary>
                  <JobsTable rows={g.jobs} followUps={followUps} today={today} params={params} />
                </details>
              ) : (
                <JobsTable key={g.key} rows={g.jobs} followUps={followUps} today={today} params={params} />
              ),
            )}
          </div>
        )}
        {stats.noJd > 0 && !params.jd && (
          <p className="text-xs text-muted-foreground">
            {stats.noJd} open job{stats.noJd === 1 ? " has" : "s have"} no description (mostly LinkedIn), so they can&apos;t be
            scored or tailored.{" "}
            <Link href={listUrl({ ...params, status: undefined }, { jd: "no" })} className="underline underline-offset-4">
              Show them
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}

const COLUMNS: { key: SortColumn; label: string; className: string }[] = [
  { key: "match", label: "Match", className: "w-24" },
  { key: "title", label: "Role", className: "w-[34%]" },
  { key: "company", label: "Company", className: "w-[17%]" },
  { key: "location", label: "Location", className: "w-[19%]" },
  { key: "status", label: "Status", className: "w-36" },
  { key: "added", label: "Added", className: "w-28" },
];

function JobsTable({
  rows,
  followUps,
  today,
  params,
}: {
  rows: Job[];
  followUps: Map<number, string | null>;
  today: string;
  params: ListParams;
}) {
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      {/* Fixed column widths so tables in different groups line up. */}
      <Table className="min-w-[56rem] table-fixed">
        <TableHeader>
          <TableRow className="bg-muted/40 hover:bg-muted/40">
            {COLUMNS.map((c) => {
              const active = params.sort === c.key;
              const Arrow = !active ? ArrowUpDown : params.dir === "asc" ? ArrowUp : ArrowDown;
              return (
                <TableHead
                  key={c.key}
                  className={cn("h-10 px-4", c.className)}
                  aria-sort={active ? (params.dir === "asc" ? "ascending" : "descending") : "none"}
                >
                  <Link
                    href={sortUrl(params, c.key)}
                    scroll={false}
                    className={cn(
                      "group/sort inline-flex items-center gap-1.5 text-xs font-medium tracking-wide uppercase hover:text-foreground",
                      active ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {c.label}
                    <Arrow className={cn("size-3.5", !active && "opacity-0 group-hover/sort:opacity-60")} />
                  </Link>
                </TableHead>
              );
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((job) => {
            const followUp = followUps.get(job.id);
            return (
              <TableRow key={job.id} className="group/row relative">
                <TableCell className="px-4 py-3">
                  <ScoreBadge score={job.matchScore} />
                </TableCell>
                <TableCell className="px-4 py-3">
                  <Link
                    href={`/jobs/${job.id}`}
                    className="block truncate font-medium after:absolute after:inset-0 group-hover/row:underline"
                    title={job.title}
                  >
                    {job.title}
                  </Link>
                  {!job.description && <span className="text-xs text-muted-foreground">No description</span>}
                </TableCell>
                <TableCell className="truncate px-4 py-3" title={job.company}>
                  {job.company || "—"}
                </TableCell>
                <TableCell className="truncate px-4 py-3 text-muted-foreground" title={job.location ?? ""}>
                  {job.location ?? "—"}
                </TableCell>
                <TableCell className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <StatusBadge status={job.status} />
                    {job.status === "applied" && followUp && followUp <= today && (
                      <BellRing className="size-3.5 text-amber-600 dark:text-amber-400" aria-label="Follow-up due" />
                    )}
                  </div>
                </TableCell>
                <TableCell className="px-4 py-3 whitespace-nowrap text-muted-foreground tabular-nums">
                  {formatDay(job.createdAt)}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function formatDay(sqlDate: string) {
  return new Date(sqlDate.replace(" ", "T") + "Z").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function StatCard({
  href,
  icon: Icon,
  label,
  value,
  tone,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  tone?: "emerald" | "amber";
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-xl border bg-card p-4 transition-colors hover:border-foreground/20"
    >
      <span
        className={cn(
          "flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground",
          tone === "emerald" && "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
          tone === "amber" && "bg-amber-500/15 text-amber-700 dark:text-amber-400",
        )}
      >
        <Icon className="size-4" />
      </span>
      <span>
        <span className="block text-2xl leading-none font-semibold tabular-nums">{value}</span>
        <span className="text-xs text-muted-foreground group-hover:text-foreground">{label}</span>
      </span>
    </Link>
  );
}

function StatusTab({
  href,
  active,
  label,
  count,
  dot,
}: {
  href: string;
  active: boolean;
  label: string;
  count: number;
  dot?: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      scroll={false}
      className={cn(
        "flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium transition-colors",
        active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
        count === 0 && !active && "opacity-50",
      )}
    >
      {dot}
      {label}
      <span className="text-xs tabular-nums text-muted-foreground">{count}</span>
    </Link>
  );
}

function SyncStatus() {
  if (!isAirtableConfigured()) {
    return <span className="text-sm text-muted-foreground">Airtable not connected</span>;
  }
  const last = getLastSync();
  return (
    <form action={syncNow} className="flex items-center gap-3 text-sm">
      {last && (
        <span className={last.error ? "text-destructive" : "text-muted-foreground"}>
          {last.error ? "Airtable sync failed" : `Synced ${new Date(last.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
        </span>
      )}
      <SubmitButton variant="outline" className="bg-background" pendingLabel="Syncing…">
        <RefreshCw />
        Sync now
      </SubmitButton>
    </form>
  );
}
