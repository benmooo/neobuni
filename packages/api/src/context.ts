import type { Session } from "@neobuni/auth";
import type { Profile } from "@neobuni/contracts";
import type { Database } from "@neobuni/db";

export interface Context {
  db: Database;
  profile: Profile | null;
  profileId: string | null;
  session: Session | null;
  userId: string | null;
}
