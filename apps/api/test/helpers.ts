import "reflect-metadata";
import type { INestApplicationContext } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { eq } from "drizzle-orm";
import type { AuthCtx } from "../src/common/auth";
import { encryptSecret } from "../src/common/crypto";
import { CoreModule } from "../src/core.module";
import { DB, type Db } from "../src/db/db";
import { runMigrations } from "../src/db/migrate";
import { mailboxes, memberships, organizations, users } from "../src/db/schema";
import { createPersonalWorkspace } from "../src/auth/auth.service";

let ctx: INestApplicationContext | null = null;

export async function boot() {
	if (!ctx) {
		await runMigrations(process.env.DATABASE_URL as string);
		ctx = await NestFactory.createApplicationContext(CoreModule, { logger: false });
	}
	return ctx;
}

export async function shutdown() {
	await ctx?.close();
	ctx = null;
}

export function db(app: INestApplicationContext): Db {
	return app.get(DB);
}

export const uniq = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/** A user with a personal workspace, as an AuthCtx. */
export async function makeUser(app: INestApplicationContext, name = "Test User"): Promise<AuthCtx> {
	const d = db(app);
	const email = `u-${uniq()}@example.test`;
	const [u] = await d.insert(users).values({ fullName: name, email, emailVerifiedAt: new Date() }).returning();
	const org = await createPersonalWorkspace(d, u.id, name);
	return { userId: u.id, email, orgId: org.id, role: "owner", org, isPlatformAdmin: false };
}

/** Same user, acting inside another workspace they belong to. */
export async function asMemberOf(app: INestApplicationContext, user: AuthCtx, orgId: string, role: "owner" | "admin" | "member" = "member"): Promise<AuthCtx> {
	const d = db(app);
	await d.insert(memberships).values({ userId: user.userId, organizationId: orgId, role }).onConflictDoNothing();
	const [org] = await d.select().from(organizations).where(eq(organizations.id, orgId));
	return { ...user, orgId, role, org };
}

export async function refreshOrg(app: INestApplicationContext, c: AuthCtx): Promise<AuthCtx> {
	const [org] = await db(app).select().from(organizations).where(eq(organizations.id, c.orgId));
	return { ...c, org };
}

export const GREENMAIL = process.env.GREENMAIL_HOST ?? "greenmail";

/** Insert an IMAP mailbox row pointing at GreenMail (skips the live connect test). */
export async function greenmailMailbox(app: INestApplicationContext, c: AuthCtx, email: string) {
	const [m] = await db(app)
		.insert(mailboxes)
		.values({
			organizationId: c.orgId,
			userId: c.userId,
			provider: "imap",
			emailAddress: email,
			imapHost: GREENMAIL,
			imapPort: 3143,
			smtpHost: GREENMAIL,
			smtpPort: 3025,
			useTls: false,
			username: email,
			passwordEnc: encryptSecret("secret"),
		})
		.returning();
	return m;
}
