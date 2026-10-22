import { eq } from "drizzle-orm";
import { Effect } from "effect";

import { db, fromPromise } from "../client";
import { buildDefaultSoulConfigInput } from "../defaults/soul-config";
import { profilesTable, sessionsTable } from "../schema";
import { upsertAgentConfig } from "./agent-config";
import { upsertSoulConfig } from "./soul-config";

const toProfile = (row: typeof profilesTable.$inferSelect) => ({
	id: row.id,
	ownerUserId: row.ownerUserId,
	name: row.name,
	kind: row.kind,
	timezone: row.timezone,
	archivedAt: row.archivedAt,
	createdAt: row.createdAt,
	updatedAt: row.updatedAt,
});

const ensureProfileDefaults = Effect.fnUntraced(function* (profileId: string) {
	const existingSoulConfig = yield* fromPromise("ensureProfileDefaults", () =>
		db.query.soulConfigsTable.findFirst({
			where: { profileId },
		})
	);
	const existingAgentConfig = yield* fromPromise("ensureProfileDefaults", () =>
		db.query.agentConfigsTable.findFirst({
			where: { profileId },
		})
	);

	if (!existingSoulConfig) {
		yield* upsertSoulConfig(profileId, buildDefaultSoulConfigInput());
	}

	if (!existingAgentConfig) {
		yield* upsertAgentConfig(profileId, {
			aiName: "Buni",
			avatarUri: "",
			userName: "You",
			userPersona: "",
		});
	}

	return {
		profileId,
		createdSoulConfig: !existingSoulConfig,
		createdAgentConfig: !existingAgentConfig,
	};
});

const listProfilesForUser = Effect.fnUntraced(function* (userId: string) {
	const rows = yield* fromPromise("listProfilesForUser", () =>
		db.query.profilesTable.findMany({
			where: { ownerUserId: userId },
			orderBy: { createdAt: "asc" },
		})
	);

	return rows.filter((row) => row.archivedAt === null).map(toProfile);
});

const getProfileForUser = Effect.fnUntraced(function* (
	userId: string,
	profileId: string
) {
	const row = yield* fromPromise("getProfileForUser", () =>
		db.query.profilesTable.findFirst({
			where: {
				id: profileId,
				ownerUserId: userId,
			},
		})
	);

	return row && row.archivedAt === null ? toProfile(row) : null;
});

const createProfileForUser = Effect.fnUntraced(function* (
	userId: string,
	name: string
) {
	const now = new Date().toISOString();
	const next = {
		id: crypto.randomUUID(),
		ownerUserId: userId,
		name,
		kind: "personal",
		timezone: null,
		archivedAt: null,
		createdAt: now,
		updatedAt: now,
	} as const;

	yield* fromPromise("createProfileForUser", () =>
		db.insert(profilesTable).values(next)
	);
	return next;
});

const ensurePersonalProfileForUser = Effect.fnUntraced(function* (
	userId: string,
	userName: string
) {
	const existing = yield* fromPromise("ensurePersonalProfileForUser", () =>
		db.query.profilesTable.findFirst({
			where: { ownerUserId: userId },
			orderBy: { createdAt: "asc" },
		})
	);

	if (existing && existing.archivedAt === null) {
		return toProfile(existing);
	}

	const profile = yield* createProfileForUser(
		userId,
		userName.trim().length > 0 ? `${userName} 的 Buni` : "My Buni"
	);

	yield* ensureProfileDefaults(profile.id);

	return toProfile(profile);
});

const getPreferredProfileIdForUser = Effect.fnUntraced(function* (
	userId: string
) {
	const recentSessions = yield* fromPromise(
		"getPreferredProfileIdForUser",
		() =>
			db.query.sessionsTable.findMany({
				where: { userId },
				orderBy: { updatedAt: "desc" },
				limit: 10,
			})
	);

	for (const session of recentSessions) {
		if (!session.activeProfileId) {
			continue;
		}

		const profile = yield* getProfileForUser(userId, session.activeProfileId);
		if (profile) {
			return profile.id;
		}
	}

	const firstProfile = yield* fromPromise("getPreferredProfileIdForUser", () =>
		db.query.profilesTable.findFirst({
			where: { ownerUserId: userId },
			orderBy: { createdAt: "asc" },
		})
	);

	return firstProfile && firstProfile.archivedAt === null
		? firstProfile.id
		: null;
});

const getProfile = Effect.fnUntraced(function* (profileId: string) {
	const row = yield* fromPromise("getProfile", () =>
		db.query.profilesTable.findFirst({
			where: { id: profileId },
		})
	);

	return row && row.archivedAt === null ? toProfile(row) : null;
});

const listActiveProfiles = Effect.fnUntraced(function* () {
	const rows = yield* fromPromise("listActiveProfiles", () =>
		db.query.profilesTable.findMany({
			orderBy: { createdAt: "asc" },
		})
	);

	return rows.filter((row) => row.archivedAt === null).map(toProfile);
});

const updateProfile = Effect.fnUntraced(function* (
	profileId: string,
	input: Partial<{
		timezone: string | null;
	}>
) {
	const current = yield* fromPromise("updateProfile", () =>
		db.query.profilesTable.findFirst({
			where: { id: profileId },
		})
	);

	if (!current || current.archivedAt !== null) {
		return null;
	}

	const next = {
		timezone: input.timezone === undefined ? current.timezone : input.timezone,
		updatedAt: new Date().toISOString(),
	};

	yield* fromPromise("updateProfile", () =>
		db.update(profilesTable).set(next).where(eq(profilesTable.id, profileId))
	);

	return toProfile({
		...current,
		...next,
	});
});

const setSessionActiveProfile = Effect.fnUntraced(function* (
	sessionId: string,
	profileId: string
) {
	yield* fromPromise("setSessionActiveProfile", () =>
		db
			.update(sessionsTable)
			.set({
				activeProfileId: profileId,
				updatedAt: new Date(),
			})
			.where(eq(sessionsTable.id, sessionId))
	);
});

export {
	ensurePersonalProfileForUser,
	getPreferredProfileIdForUser,
	getProfile,
	getProfileForUser,
	listActiveProfiles,
	listProfilesForUser,
	setSessionActiveProfile,
	updateProfile,
};
