import type { Session } from "@neobuni/auth";
import type { Profile } from "@neobuni/contracts";
import type { Database } from "@neobuni/db";

export type Context = {
	session: Session | null;
	db: Database;
	userId: string | null;
	profileId: string | null;
	profile: Profile | null;
};
