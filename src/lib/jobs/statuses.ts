/** Job workflow states, in order. Shared by the DB schema and client components. */
export const JOB_STATUSES = ["new", "reviewing", "ready", "applied", "interview", "rejected", "skipped"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];
