import type { BillingInterval, EffectiveLimits, PlanId } from "./plans";
import type { Role } from "./orgs";

export interface ApiErrorBody {
	error: { message: string; code?: string };
}

export interface OrgSummary {
	id: string;
	name: string;
	slug: string;
	isPersonal: boolean;
	role: Role;
	plan: PlanId;
}

export interface UsageSummary {
	period: string;
	aiActionsUsed: number;
	aiActionsLimit: number;
	mailboxes: number;
	mailboxesLimit: number;
	seatsUsed: number;
	seatsLimit: number;
}

export interface MeResponse {
	user: {
		id: string;
		fullName: string;
		email: string;
		emailVerified: boolean;
		hasPassword: boolean;
		avatarUrl: string | null;
		isPlatformAdmin: boolean;
	};
	organizations: OrgSummary[];
	activeOrg: OrgSummary & { suspended: boolean };
	limits: EffectiveLimits;
	usage: UsageSummary;
	features: FeatureFlags;
}

export interface MemberView {
	userId: string;
	fullName: string;
	email: string;
	role: Role;
	joinedAt: string;
}

export interface InviteView {
	id: string;
	email: string;
	role: Role;
	expiresAt: string;
	/** Only returned to the inviter when outbound email is not configured. */
	link?: string;
}

export interface BillingSummary {
	configured: boolean;
	plan: PlanId;
	source: "free" | "subscription" | "comp";
	/** True when the org is on a live USD (Polar) Team sub billed per seat. */
	perSeatBilling: boolean;
	subscription: null | {
		status: string;
		plan: PlanId;
		interval: BillingInterval | null;
		seats: number;
		currentPeriodEnd: string | null;
		cancelAtPeriodEnd: boolean;
	};
	canManage: boolean;
	availableIntervals: { pro: BillingInterval[]; team: BillingInterval[] };
}

export interface AdminOrgRow {
	id: string;
	name: string;
	isPersonal: boolean;
	plan: PlanId;
	compPlan: PlanId | null;
	members: number;
	mailboxes: number;
	aiActionsThisMonth: number;
	subscriptionStatus: string | null;
	mrrCents: number;
	suspended: boolean;
	createdAt: string;
}

export interface AdminUserRow {
	id: string;
	fullName: string;
	email: string;
	verified: boolean;
	organizations: number;
	createdAt: string;
}

export interface AdminOverview {
	orgs: number;
	users: number;
	paidOrgs: number;
	mrrCents: number;
	aiActionsThisMonth: number;
	mailboxes: number;
}

export interface FeatureFlags {
	google: boolean;
	gmail: boolean;
	ai: boolean;
	email: boolean;
	billing: boolean;
}

/** GET /api/config (public). */
export interface ConfigResponse {
	features: FeatureFlags;
	/** Name of the AI provider host, shown on the privacy page. */
	aiProvider: string | null;
	undoSendSeconds: number;
}

/** POST /api/auth/register. accessToken is set when no email check is needed. */
export interface RegisterResponse {
	userId: string;
	needsVerification: boolean;
	accessToken?: string;
}

export interface InvitePreview {
	organizationName: string;
	invitedBy: string | null;
	email: string;
	role: Role;
	expired: boolean;
}
