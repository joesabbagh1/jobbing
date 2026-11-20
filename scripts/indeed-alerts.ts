/**
 * Reads the Indeed job alert emails in Gmail (IMAP, app password in .env.local) and writes them as plain text for the
 * daily job hunt (scripts/job-hunt.md), which turns them into jobs. Indeed blocks automated access to its site, so
 * these emails are the only way its postings reach the app.
 *
 *   npm run indeed:alerts -- out.json [days]   writes the new alert emails to out.json
 *   npm run indeed:alerts -- done out.json      marks them handled, once their jobs are saved
 *
 * Only emails from indeed.com are read, nothing else in the mailbox. Handled emails are skipped on later days (their
 * Message-IDs are kept in data/indeed-seen.json), so a failed hunt leaves them for the next one. Indeed's tracking links are resolved to plain
 * https://fr.indeed.com/viewjob?jk=… links where possible.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { config } from "dotenv";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";

config({ path: [".env.local", ".env"], quiet: true });

const SEEN_FILE = "data/indeed-seen.json";
const MAX_TEXT = 15_000;

/** Turns an Indeed link (tracking redirect or not) into https://fr.indeed.com/viewjob?jk=…, or null if it isn't a job. */
async function jobLink(url: string): Promise<string | null> {
  const jk = (u: string) => {
    try {
      return new URL(u).searchParams.get("jk") ?? new URL(u).searchParams.get("vjk");
    } catch {
      return null;
    }
  };
  let key = jk(url);
  if (!key && /indeed\./.test(url) && !/unsubscribe|preferences|settings|privacy|help|legal/i.test(url)) {
    // Tracking links redirect to the job; follow a few hops without loading the (blocked) job page itself.
    let next = url;
    for (let hop = 0; hop < 4 && !key; hop++) {
      try {
        const res = await fetch(next, { redirect: "manual", signal: AbortSignal.timeout(10_000) });
        const location = res.headers.get("location");
        if (!location) break;
        next = new URL(location, next).toString();
        key = jk(next);
      } catch {
        break;
      }
    }
  }
  return key && /^[0-9a-f]{16}$/i.test(key) ? `https://fr.indeed.com/viewjob?jk=${key}` : null;
}

async function main() {
  const args = process.argv.slice(2);
  const seen = new Set<string>(existsSync(SEEN_FILE) ? JSON.parse(readFileSync(SEEN_FILE, "utf8")) : []);
  if (args[0] === "done" && args[1]) {
    const handled: { messageId: string }[] = JSON.parse(readFileSync(args[1], "utf8"));
    for (const e of handled) seen.add(e.messageId);
    writeFileSync(SEEN_FILE, JSON.stringify([...seen].slice(-500)));
    console.log(`Marked ${handled.length} Indeed alert emails as handled.`);
    return;
  }
  const [file, daysArg] = args;
  if (!file) {
    console.error("Usage: npm run indeed:alerts -- <out.json> [days]  |  npm run indeed:alerts -- done <out.json>");
    process.exit(1);
  }
  const { GMAIL_USER, GMAIL_APP_PASSWORD } = process.env;
  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
    console.error("GMAIL_USER and GMAIL_APP_PASSWORD are not set in .env.local");
    process.exit(1);
  }
  const days = Number(daysArg ?? 4);

  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
    logger: false,
  });
  await client.connect();
  const emails: { messageId: string; date: string; subject: string; text: string }[] = [];
  const lock = await client.getMailboxLock("[Gmail]/All Mail");
  try {
    const uids = (await client.search({ from: "indeed.com", since: new Date(Date.now() - days * 864e5) }, { uid: true })) || [];
    for await (const msg of client.fetch(uids, { source: true }, { uid: true })) {
      if (!msg.source) continue;
      const mail = await simpleParser(msg.source);
      const from = mail.from?.value[0]?.address ?? "";
      const messageId = mail.messageId ?? `uid-${msg.uid}`;
      if (!/(^|[.@])indeed\.com$/i.test(from) || seen.has(messageId)) continue;

      // Plain text with links inline, Indeed links resolved to job links and the others dropped.
      let text = mail.text ?? "";
      const links = [...new Set(text.match(/https?:\/\/[^\s\]>)"]+/g) ?? [])];
      for (const link of links) {
        const job = await jobLink(link);
        text = text.split(link).join(job ?? "");
      }
      text = text
        .replace(/[\u034f\u00ad\u200b-\u200d\u2060\ufeff]/g, "") // invisible preheader padding
        .replace(/\[\s*\]|<\s*>|\(\s*\)/g, "")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
      // Sign-in codes and other account emails have no job in them, and aren't passed on.
      if (!text.includes("viewjob?jk=")) continue;
      emails.push({
        messageId,
        date: (mail.date ?? new Date()).toISOString().slice(0, 10),
        subject: mail.subject ?? "",
        text: text.slice(0, MAX_TEXT),
      });
    }
  } finally {
    lock.release();
    await client.logout();
  }

  writeFileSync(file, JSON.stringify(emails, null, 2));
  console.log(`Indeed alert emails: ${emails.length} new (last ${days} days) → ${file}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
