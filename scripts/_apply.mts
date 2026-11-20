// prep <id>: render the job's CV and letter PDFs to the scratchpad. done <id> <via>: record the application.
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { createDb } from "../src/db";
import { applications, jobs } from "../src/db/schema";
import { renderPdf } from "../src/lib/cv/pdf";
import { getTailoredCv } from "../src/lib/cv/store";
import { documentFilename } from "../src/lib/filename";
import { getLetter } from "../src/lib/letter/store";
import { letterPlainText } from "../src/lib/letter/schema";

const OUT = "/Users/joesabbagh/Development/jobbing/data/apply";
const [cmd, idStr, via = "company site"] = process.argv.slice(2);
const id = Number(idStr);
const db = createDb("data/jobbing.db");
const job = db.select().from(jobs).where(eq(jobs.id, id)).get()!;
const cv = getTailoredCv(db, id)!;
const letter = getLetter(db, id)!;
const dir = `${OUT}/${id}`;
const cvName = documentFilename(cv.basics.name, "CV", job.company);
const letterName = documentFilename(cv.basics.name, letter.language === "fr" ? "Lettre_de_motivation" : "Cover_Letter", job.company);
if (cmd === "prep") {
  mkdirSync(dir, { recursive: true });
  const [cvPdf, letterPdf] = await Promise.all([renderPdf(`http://127.0.0.1:3000/print/cv/${id}`), renderPdf(`http://127.0.0.1:3000/print/letter/${id}`)]);
  writeFileSync(`${dir}/${cvName}`, cvPdf);
  writeFileSync(`${dir}/${letterName}`, letterPdf);
  writeFileSync(`${dir}/letter.txt`, letterPlainText(letter, cv.basics.name));
  console.log(JSON.stringify({ id, company: job.company, title: job.title, url: job.url, lang: letter.language, cv: `${dir}/${cvName}`, letter: `${dir}/${letterName}`, letterTxt: `${dir}/letter.txt` }, null, 1));
} else if (cmd === "done") {
  const cvPdf = readFileSync(`${dir}/${cvName}`), letterPdf = readFileSync(`${dir}/${letterName}`);
  db.transaction((tx) => {
    tx.insert(applications).values({ jobId: id, via: via as any, notes: "Applied by Claude", followUpOn: null, cv, letter, cvPdf, cvFilename: cvName, letterPdf, letterFilename: letterName }).onConflictDoNothing().run();
    tx.update(jobs).set({ status: "applied" }).where(eq(jobs.id, id)).run();
  });
  console.log(`#${id} recorded as applied via ${via}`);
}
process.exit(0);
