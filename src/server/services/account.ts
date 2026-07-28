import { eq } from "drizzle-orm";
import { db } from "@/db";
import { memberships, teams, users } from "@/db/schema";
import { ApiError } from "@/server/lib/http";
import { resolveEntitlements } from "./entitlements";

export interface MePayload {
	user: {
		id: string;
		fullName: string;
		email: string;
		emailVerified: boolean;
		hasPassword: boolean;
		avatarUrl: string | null;
	};
	memberships: Array<{
		teamId: string;
		teamName: string;
		teamSlug: string;
		isPersonal: boolean;
		isOwner: boolean;
		role: "owner" | "admin" | "member";
		plan: "free" | "pro" | "team";
	}>;
	activeTeam: {
		id: string;
		name: string;
		role: "owner" | "admin" | "member";
		plan: "free" | "pro" | "team";
	};
	entitlements: string[];
}

/** Full current-user payload: profile, teams, active team, entitlements. */
export async function getMe(
	userId: string,
	activeTeamId: string,
): Promise<MePayload> {
	const [user] = await db
		.select()
		.from(users)
		.where(eq(users.id, userId))
		.limit(1);
	if (!user) throw new ApiError(404, "User not found");

	const rows = await db
		.select({
			teamId: teams.id,
			teamName: teams.name,
			teamSlug: teams.slug,
			isPersonal: teams.isPersonal,
			ownerUserId: teams.ownerUserId,
			role: memberships.role,
			plan: memberships.plan,
		})
		.from(memberships)
		.innerJoin(teams, eq(memberships.teamId, teams.id))
		.where(eq(memberships.userId, userId));

	const active = rows.find((r) => r.teamId === activeTeamId) ?? rows[0];
	if (!active) throw new ApiError(403, "No team membership");

	const entitlements = await resolveEntitlements(active.plan, active.teamId);

	return {
		user: {
			id: user.id,
			fullName: user.fullName,
			email: user.email,
			emailVerified: Boolean(user.emailVerifiedAt),
			hasPassword: Boolean(user.passwordHash),
			avatarUrl: user.avatarUrl ?? null,
		},
		memberships: rows.map((r) => ({
			teamId: r.teamId,
			teamName: r.teamName,
			teamSlug: r.teamSlug,
			isPersonal: r.isPersonal,
			isOwner: r.ownerUserId === userId,
			role: r.role,
			plan: r.plan,
		})),
		activeTeam: {
			id: active.teamId,
			name: active.teamName,
			role: active.role,
			plan: active.plan,
		},
		entitlements,
	};
}
