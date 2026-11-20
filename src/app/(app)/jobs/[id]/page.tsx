import { eq } from "drizzle-orm";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  CheckCircle2,
  Download,
  ExternalLink,
  FileText,
  FileUser,
  PenLine,
  RefreshCw,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ConfirmAction } from "@/components/confirm-action";
import { CopyTextButton } from "@/components/copy-text-button";
import { PageHeader } from "@/components/page-header";
import { PdfPreview } from "@/components/pdf-preview";
import { ScoreBadge } from "@/components/status-badge";
import { SubmitButton } from "@/components/submit-button";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { getDb } from "@/db";
import { applications, jobs } from "@/db/schema";
import { resetTailoredCv } from "@/lib/cv/actions";
import { LANGUAGE_NAMES } from "@/lib/cv/schema";
import { getTailoredCv, masterLanguages, pickMasterCv } from "@/lib/cv/store";
import { refetchDescription, updateJob } from "@/lib/jobs/actions";
import { nextReadyJob } from "@/lib/jobs/list";
import { letterCv } from "@/lib/letter/context";
import { letterPlainText, postingLanguage } from "@/lib/letter/schema";
import { getLetter } from "@/lib/letter/store";
import { cn } from "@/lib/utils";
import { ApplyCard } from "./apply-card";
import { StartCvButtons } from "./start-cv-buttons";
import { StatusSelect } from "./status-select";

export const dynamic = "force-dynamic";

const VERDICT = {
  apply: { label: "Strong fit", className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
  maybe: { label: "Worth a look", className: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  skip: { label: "Weak fit", className: "bg-muted text-muted-foreground" },
} as const;

export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();

  const db = getDb();
  const job = db.select().from(jobs).where(eq(jobs.id, id)).get();
  if (!job) notFound();

  // Opening a new finding counts as starting to review it.
  if (job.status === "new") {
    db.update(jobs).set({ status: "reviewing" }).where(eq(jobs.id, id)).run();
    job.status = "reviewing";
  }

  const tailoredCv = getTailoredCv(db, job.id);
  const tailored = Boolean(tailoredCv);
  const masters = masterLanguages(db);
  const hasMaster = masters.length > 0;
  // A new tailored CV starts from the master CV in the posting's language, when there is one.
  const startLanguage = pickMasterCv(db, postingLanguage(job.description))?.language;
  const letter = getLetter(db, job.id);
  const hasLetter = Boolean(letter?.body.trim());
  const letterText = letter && hasLetter ? letterPlainText(letter, letterCv(db, job.id, letter.language)?.basics.name) : "";
  const application = db
    .select({
      appliedAt: applications.appliedAt,
      via: applications.via,
      notes: applications.notes,
      followUpOn: applications.followUpOn,
      letterFilename: applications.letterFilename,
    })
    .from(applications)
    .where(eq(applications.jobId, job.id))
    .get();
  const today = new Date().toISOString().slice(0, 10);
  const inTenDays = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
  const save = updateJob.bind(null, job.id);
  const next = nextReadyJob(db, job.id);
  // The Growth bot writes "Notes" and "Tags" columns; show those prominently.
  const { Notes: botNotes, Tags: tags, Status: _airtableStatus, ...rest } = job.extra ?? {};
  void _airtableStatus;
  const extra = Object.entries(rest);

  return (
    <div>
      <PageHeader
        sticky
        back={{ href: "/", label: "All jobs" }}
        title={job.title}
        description={[job.company, job.location].filter(Boolean).join(" · ")}
        actions={
          <>
            <StatusSelect jobId={job.id} status={job.status} />
            {next && (
              <Link
                href={`/jobs/${next.id}`}
                title={`${next.title}${next.company ? ` · ${next.company}` : ""}`}
                className={buttonVariants({ variant: "outline", className: "h-9" })}
              >
                Next ready ({next.remaining})
                <ArrowRight />
              </Link>
            )}
            <a href={job.url} target="_blank" rel="noopener noreferrer" className={buttonVariants({ className: "h-9" })}>
              Open posting
              <ExternalLink />
            </a>
          </>
        }
      >
        {Array.isArray(tags) && tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {tags.map((t) => (
              <Badge key={String(t)} variant="secondary">
                {String(t)}
              </Badge>
            ))}
          </div>
        )}
      </PageHeader>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          {job.analysis && (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <ScoreBadge score={job.matchScore} className="h-9 min-w-12 text-base" />
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      Match
                      <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", VERDICT[job.analysis.verdict].className)}>
                        {VERDICT[job.analysis.verdict].label}
                      </span>
                    </CardTitle>
                    <CardDescription>Scored against your search profile</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <p className="leading-relaxed">{job.analysis.summary}</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <AnalysisList
                    title="Why it fits"
                    items={job.analysis.reasons}
                    icon={<CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />}
                  />
                  <AnalysisList
                    title="Concerns"
                    items={job.analysis.concerns}
                    icon={<AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />}
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {typeof botNotes === "string" && botNotes && (
            <div className="flex gap-3 rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 text-sm">
              <Bot className="mt-0.5 size-4 shrink-0 text-blue-600 dark:text-blue-400" />
              <div>
                <p className="mb-1 font-medium">Grok bot notes</p>
                <p className="leading-relaxed whitespace-pre-wrap text-muted-foreground">{botNotes}</p>
              </div>
            </div>
          )}

          <div className="grid items-start gap-6 md:grid-cols-2">
            <Card size="sm">
              <CardHeader>
                <CardTitle>Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <form action={save} className="space-y-2">
                  <Textarea name="notes" defaultValue={job.notes ?? ""} placeholder="Contacts, salary, impressions…" className="min-h-24" />
                  <SubmitButton size="sm" variant="outline" pendingLabel="Saving…">
                    Save notes
                  </SubmitButton>
                </form>
              </CardContent>
            </Card>

            <Card size="sm">
              <CardHeader>
                <CardTitle>Details</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                  <Meta label="Added" value={new Date(job.createdAt.replace(" ", "T") + "Z").toLocaleDateString(undefined, { dateStyle: "medium" })} />
                  {job.postedAt && <Meta label="Posted" value={job.postedAt.slice(0, 10)} />}
                  {job.source && <Meta label="Source" value={job.source} />}
                  {extra.map(([k, v]) => (
                    <Meta key={k} label={k} value={Array.isArray(v) ? v.join(", ") : typeof v === "string" ? v : JSON.stringify(v)} />
                  ))}
                </dl>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Job description</CardTitle>
              {job.description && job.descriptionSource && (
                <CardDescription>
                  {job.descriptionSource === "manual" ? "Pasted by you" : `Fetched from ${job.descriptionSource}`}
                </CardDescription>
              )}
            </CardHeader>
            <CardContent>
              {job.description ? (
                <div className="text-sm leading-relaxed whitespace-pre-wrap">
                  {/* Some sites pad paragraphs with runs of blank lines; show one blank line at most. */}
                  {job.description.replace(/\n[ \t\u00a0]*(?:\n[ \t\u00a0]*)+/g, "\n\n").trim()}
                </div>
              ) : (
                <form action={save} className="space-y-3">
                  <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                    {job.descriptionError ??
                      (job.descriptionFetchedAt
                        ? "No description yet. Paste it from the posting."
                        : "Fetching the description in the background… refresh in a minute, or paste it below.")}
                  </div>
                  <Textarea
                    name="description"
                    required
                    className="min-h-64"
                    placeholder="Paste the full job description here…"
                  />
                  <div className="flex gap-2">
                    <SubmitButton pendingLabel="Saving…">Save description</SubmitButton>
                    <Button type="submit" variant="ghost" formAction={refetchDescription.bind(null, job.id)} formNoValidate>
                      <RefreshCw />
                      Try fetching again
                    </Button>
                  </div>
                </form>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Just the Apply card, so it fits on screen and stays in view under the pinned title. No scroll box of
            its own: the wheel always scrolls the page, wherever the pointer is. */}
        <aside className="lg:sticky lg:top-[calc(3.5rem+1px+var(--sticky-bar-h,0px)+1.5rem)]">
          <ApplyCard
            jobId={job.id}
            ready={hasMaster || Boolean(tailored)}
            next={next && { href: `/jobs/${next.id}`, title: next.title, company: next.company, remaining: next.remaining }}
            defaultFollowUp={inTenDays}
            today={today}
            applied={
              application && {
                appliedAt: application.appliedAt,
                via: application.via,
                notes: application.notes,
                followUpOn: application.followUpOn,
                hasLetter: Boolean(application.letterFilename),
              }
            }
            documents={
              <>
                <DocumentRow
                  icon={FileUser}
                  title="CV"
                  status={
                    tailoredCv
                      ? `Tailored for this job · ${LANGUAGE_NAMES[tailoredCv.language]}`
                      : hasMaster
                        ? "Master CV, not tailored yet"
                        : "No CV yet"
                  }
                  done={tailored}
                >
                  {tailored ? (
                    <>
                      <Link href={`/jobs/${job.id}/cv`} className={buttonVariants({ size: "sm" })}>
                        <PenLine />
                        Edit
                      </Link>
                      <PdfPreview src={`/api/cv/${job.id}/pdf`} title={["CV", job.company].filter(Boolean).join(" · ")} />
                      <a href={`/api/cv/${job.id}/pdf?download`} className={buttonVariants({ size: "sm", variant: "outline" })}>
                        <Download />
                        PDF
                      </a>
                      <ConfirmAction
                        title="Discard the tailored CV?"
                        description="Your edits for this job are deleted. You can tailor a fresh copy of your master CV afterwards."
                        confirmLabel="Discard"
                        onConfirm={resetTailoredCv.bind(null, job.id)}
                        trigger={
                          <Button size="icon-sm" variant="ghost" aria-label="Discard tailored CV" className="text-muted-foreground">
                            <Trash2 />
                          </Button>
                        }
                      />
                    </>
                  ) : startLanguage ? (
                    <StartCvButtons
                      jobId={job.id}
                      languages={masters}
                      defaultLanguage={startLanguage}
                    />
                  ) : (
                    <Link href="/cv" className={buttonVariants({ size: "sm", variant: "outline" })}>
                      Create your CV
                    </Link>
                  )}
                </DocumentRow>

                <DocumentRow
                  icon={FileText}
                  title="Cover letter"
                  status={hasLetter ? `${letter!.body.trim().split(/\s+/).length} words` : "Not written yet (optional)"}
                  done={hasLetter}
                >
                  {hasLetter ? (
                    <>
                      <Link href={`/jobs/${job.id}/letter`} className={buttonVariants({ size: "sm" })}>
                        <PenLine />
                        Edit
                      </Link>
                      <CopyTextButton text={letterText} />
                      <PdfPreview src={`/api/letter/${job.id}/pdf`} title={["Cover letter", job.company].filter(Boolean).join(" · ")} />
                      <a href={`/api/letter/${job.id}/pdf?download`} className={buttonVariants({ size: "sm", variant: "outline" })}>
                        <Download />
                        PDF
                      </a>
                    </>
                  ) : hasMaster ? (
                    <Link href={`/jobs/${job.id}/letter`} className={buttonVariants({ size: "sm", variant: "outline" })}>
                      <PenLine />
                      Write
                    </Link>
                  ) : null}
                </DocumentRow>
              </>
            }
          />
        </aside>
      </div>
    </div>
  );
}

function AnalysisList({ title, items, icon }: { title: string; items: string[]; icon: React.ReactNode }) {
  if (items.length === 0) return null;
  return (
    <div>
      <h3 className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">{title}</h3>
      <ul className="space-y-1.5">
        {items.map((item) => (
          <li key={item} className="flex gap-2">
            {icon}
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DocumentRow({
  icon: Icon,
  title,
  status,
  done,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  status: string;
  done: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3 py-3 first:pt-0 last:pb-0">
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "flex size-8 items-center justify-center rounded-lg bg-muted text-muted-foreground",
            done && "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
          )}
        >
          <Icon className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium">{title}</p>
          <p className="truncate text-xs text-muted-foreground">{status}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{value}</dd>
    </>
  );
}
