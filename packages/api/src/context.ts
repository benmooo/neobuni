import type { Session } from "@neobuni/auth";
import type { Database } from "@neobuni/db";

export type Context = {
  session: Session | null;
  db: Database;
};
