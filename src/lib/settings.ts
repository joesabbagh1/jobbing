import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { settings } from "@/db/schema";

export function getSetting<T>(db: Db, key: string): T | undefined {
  return db.select().from(settings).where(eq(settings.key, key)).get()?.value as T | undefined;
}

export function setSetting(db: Db, key: string, value: unknown) {
  db.insert(settings).values({ key, value }).onConflictDoUpdate({ target: settings.key, set: { value } }).run();
}
