import {
	type CanActivate,
	createParamDecorator,
	type ExecutionContext,
	Inject,
	Injectable,
	SetMetadata,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Role } from "@postscript/types";
import { and, eq } from "drizzle-orm";
import { platformAdmins } from "../config/env";
import { DB, type Db } from "../db/db";
import { memberships, type Organization, organizations, users } from "../db/schema";
import { ApiError } from "./errors";
import { verifyAccessToken } from "./jwt";

/** Who is calling, and in which workspace. Every tenant query keys off this. */
export interface AuthCtx {
	userId: string;
	email: string;
	orgId: string;
	role: Role;
	org: Organization;
	isPlatformAdmin: boolean;
}

const PUBLIC = "ps:public";
const ROLES = "ps:roles";
const ALLOW_SUSPENDED = "ps:allowSuspended";
const PLATFORM_ADMIN = "ps:platformAdmin";

/** No session needed (auth, webhooks, health). */
export const Public = () => SetMetadata(PUBLIC, true);
/** Only these workspace roles may call. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES, roles);
/** Still callable when the workspace is suspended (billing, account, me). */
export const AllowSuspended = () => SetMetadata(ALLOW_SUSPENDED, true);
/** Only emails listed in PLATFORM_ADMIN_EMAILS. */
export const PlatformAdmin = () => SetMetadata(PLATFORM_ADMIN, true);

export const Auth = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthCtx => {
	return ctx.switchToHttp().getRequest().auth;
});

/**
 * Global guard: default-deny. Verifies the bearer token, then re-reads the
 * membership and organization from the database on every request, so a
 * removed member or a suspended workspace loses access at once.
 */
@Injectable()
export class AuthGuard implements CanActivate {
	constructor(
		private readonly reflector: Reflector,
		@Inject(DB) private readonly db: Db,
	) {}

	async canActivate(context: ExecutionContext): Promise<boolean> {
		const targets = [context.getHandler(), context.getClass()];
		if (this.reflector.getAllAndOverride<boolean>(PUBLIC, targets)) return true;

		const req = context.switchToHttp().getRequest();
		const header: string | undefined = req.headers.authorization;
		const token = header?.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : undefined;
		if (!token) throw new ApiError(401, "Not authenticated", "unauthenticated");
		const claims = await verifyAccessToken(token);
		if (!claims) throw new ApiError(401, "Invalid or expired session", "invalid_token");

		const [row] = await this.db
			.select({ role: memberships.role, org: organizations, email: users.email })
			.from(memberships)
			.innerJoin(organizations, eq(organizations.id, memberships.organizationId))
			.innerJoin(users, eq(users.id, memberships.userId))
			.where(and(eq(memberships.userId, claims.sub), eq(memberships.organizationId, claims.org)))
			.limit(1);
		if (!row) throw new ApiError(401, "You no longer have access to this workspace", "org_access_lost");

		const auth: AuthCtx = {
			userId: claims.sub,
			email: row.email,
			orgId: row.org.id,
			role: row.role,
			org: row.org,
			isPlatformAdmin: platformAdmins().includes(row.email.toLowerCase()),
		};
		req.auth = auth;

		if (this.reflector.getAllAndOverride<boolean>(PLATFORM_ADMIN, targets) && !auth.isPlatformAdmin) {
			throw new ApiError(403, "Platform admins only", "forbidden");
		}
		if (row.org.suspendedAt && !this.reflector.getAllAndOverride<boolean>(ALLOW_SUSPENDED, targets)) {
			throw new ApiError(403, "This workspace is suspended. Contact support.", "org_suspended");
		}
		const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES, targets);
		if (roles && !roles.includes(auth.role)) {
			throw new ApiError(403, "You don't have permission to do that", "forbidden");
		}
		return true;
	}
}
