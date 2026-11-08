# Jobbing

A personal job-application platform. The Grok bot posts findings here. Each job gets a page where you tailor your CV and cover letter (coming in later steps) and then apply.

## Setup

```bash
npm install
cp .env.example .env.local   # then fill in INGEST_API_KEY (openssl rand -hex 32)
npx playwright-core install chromium-headless-shell   # once, for PDF export
npm run dev                  # http://127.0.0.1:3000 (localhost only)
```

The SQLite database lives in `data/jobbing.db` and is created and migrated automatically on first use.

## Sending jobs from the Grok bot

`POST http://127.0.0.1:3000/api/jobs` with the header `x-api-key: <INGEST_API_KEY>`. The body is one job object or an array of up to 200 jobs.

```json
{
  "url": "https://boards.greenhouse.io/acme/jobs/123",
  "title": "Backend Engineer",
  "company": "Acme",
  "location": "Remote",
  "source": "greenhouse",
  "description": "Full job description text (optional but recommended)",
  "postedAt": "2026-11-01",
  "extra": { "salary": "80k", "anything": "else" }
}
```

Only `url` and `title` are required. Duplicates (same URL after stripping tracking params like `utm_*`) are merged: missing fields are filled in, and your status and notes are never overwritten.

Responses: `201 {id, created: true}` for a new job, `200 {id, created: false}` for a duplicate, `200 {results: [...]}` for a batch, `401` for a wrong key, `422` with field errors for an invalid payload.

Python example:

```python
import os, requests

def send_job(job: dict) -> None:
    r = requests.post(
        "http://127.0.0.1:3000/api/jobs",
        json=job,
        headers={"x-api-key": os.environ["JOBBING_API_KEY"]},
        timeout=10,
    )
    r.raise_for_status()
```

## Airtable sync (main way findings arrive)

Set `AIRTABLE_TOKEN`, `AIRTABLE_BASE_ID` and `AIRTABLE_TABLE` in `.env.local`, then:

```bash
npm run sync:airtable -- --dry   # shows detected columns and mapping
npm run sync:airtable            # imports now (the app also syncs every 5 min while running)
```

If your column names aren't detected, add them to `FIELD_CANDIDATES` in `src/lib/airtable/sync.ts`. Unmapped columns are kept in each job's `extra` field.

## Job search (our own bot)

The **Search** page lists the company boards (Lever, Ashby, Greenhouse, SmartRecruiters, Workable) the app checks. Each run:

1. lists every open position on every active board,
2. keeps titles matching your keywords and locations (and recent enough),
3. has DeepSeek score each new match against the "About you" profile, and adds those at or above the minimum score.

Runs every 6 hours while the app is open (`SEARCH_INTERVAL_HOURS`), only once `DEEPSEEK_API_KEY` is set. "Run search now" works any time. Jobs from Airtable that have a description get scored too.

```bash
npm run search -- --dry   # show what passes the filters, writes nothing
npm run search            # full run
```

## CV editor

**My CV** holds your master CV: import it from a PDF (DeepSeek structures it, copying your wording verbatim) or start blank. On any job page, "Tailor with AI" makes a copy and suggests edits (reorder, reword, hide to fit one page) you accept or dismiss; "Tailor manually" makes a copy you can edit without touching the master: hide bullets, reorder, reword. Both autosave and export to an ATS-friendly A4 PDF (`/api/cv/<master|jobId>/pdf`).

## Cover letters

On a job page, "Write with AI" drafts a 250-350 word letter in the posting's language (French or English) from the job's tailored CV (or the master), your search profile and the posting. Facts must come from your CV: numbers and technical terms that aren't in the CV, profile or posting are flagged live while you edit. Export as an A4 PDF with the same header as the CV (`/api/letter/<jobId>/pdf`).

## Applying

Each job page has an **Apply** card: a checklist (tailored CV, cover letter), download buttons and "Open posting". After submitting on the company's site, "Mark as applied" records how you applied and a follow-up date, and stores a frozen copy of the exact CV and letter PDFs you sent (later edits don't change them). The jobs list flags applications whose follow-up date has passed.

## Development

- `npm test`: unit tests (vitest)
- `npm run db:generate`: create a migration after changing `src/db/schema.ts`
