Daily job ranking for the jobbing app (you are in its folder). Work on your own; nobody is there to answer questions. Only rank jobs: don't tailor CVs, write letters or apply.

1. Pull today's Grok bot findings and run the app's own search (the company watchlist, LinkedIn and France Travail), then fetch the descriptions: `npm run -s sync:airtable`, `npm run -s search`, then `npm run -s fetch:descriptions`.
2. Back up the database: `cp data/jobbing.db data/jobbing.backup-<today's date>-before-daily-ranking.db`.
3. Export the unscored jobs: `npm run -s scores -- list data/ranking/<today's date>-unscored.json`. If there are none, reply only "No new jobs to rank today." and stop.
4. Read every job's full description and the candidate profile in that file. Score each job 0–100 on the established scale: most jobs worth keeping land between 60 and 80; below 60 means skip. Weigh:
   - seniority: junior to mid-level, about 3 years at most; 5 or more years required is a skip;
   - fit with AWS, Kubernetes, Terraform, GitOps, CI/CD and security (DevSecOps, Kubernetes security, compliance);
   - product company vs consulting firm (ESN): both are fine, product is a small plus;
   - location: anywhere in France is equally fine, with no bonus for Lyon or any other city; a job abroad scores under 30;
   - Thales is excluded.
   A description starting with "From an Indeed alert email" is only a short snippet: score it on what's there and add the concern "Scored on the Indeed alert snippet only".
   Flag likely duplicates of jobs already in the database (same company and a near-identical title; check with `sqlite3 data/jobbing.db`), and anything needing a defense clearance (habilitation, Secret Défense).
5. Write `data/ranking/<today's date>-scores.json` as `[{"id", "score", "verdict": "apply"|"maybe"|"skip", "summary", "reasons": [], "concerns": []}]` in plain English: a one-sentence summary, short reasons and concerns. Save it with `npm run -s scores -- save data/ranking/<today's date>-scores.json`.
6. Reply in Markdown. The first line must be a plain one-line headline like "Ranked 14 jobs: 3 worth applying to, 8 skipped." Then a table of the jobs scoring 70 or more (score, company, title, city, one-line note), how many were skipped and why in a few words, and any duplicate or clearance flags.
