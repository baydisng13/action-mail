import { Inject, Injectable } from "@nestjs/common";
import type { CreateTodoInput, TodoView, UpdateTodoInput } from "@postscript/types";
import { and, desc, eq, gte, or } from "drizzle-orm";
import { orgCipher } from "../common/crypto";
import { ApiError } from "../common/errors";
import { DB, type Db } from "../db/db";
import { messages, type Todo, todos } from "../db/schema";
import type { MailScope } from "../mail/mailbox.service";

interface TodoContent {
	title: string;
	notes: string | null;
}

/** To-dos are per person per workspace; title and notes are encrypted. */
@Injectable()
export class TodosService {
	constructor(@Inject(DB) private readonly db: Db) {}

	private view(orgId: string, t: Todo): TodoView {
		const c = orgCipher(orgId).dec<TodoContent>(t.contentEnc) ?? { title: "", notes: null };
		return {
			id: t.id,
			title: c.title,
			notes: c.notes,
			dueAt: t.dueAt?.toISOString() ?? null,
			status: t.status,
			source: t.source,
			threadId: t.threadId,
			messageId: t.messageId,
			completedAt: t.completedAt?.toISOString() ?? null,
			createdAt: t.createdAt.toISOString(),
		};
	}

	async list(scope: MailScope, mailboxId?: string | null): Promise<TodoView[]> {
		const dayAgo = new Date(Date.now() - 86400_000);
		const where = and(
			eq(todos.organizationId, scope.orgId),
			eq(todos.userId, scope.userId),
			or(eq(todos.status, "open"), gte(todos.completedAt, dayAgo)),
			mailboxId ? eq(messages.mailboxId, mailboxId) : undefined,
		);
		const q = this.db.select({ t: todos }).from(todos);
		const rows = mailboxId
			? await q.innerJoin(messages, eq(messages.id, todos.messageId)).where(where).orderBy(desc(todos.status), todos.dueAt, desc(todos.createdAt))
			: await q.where(where).orderBy(desc(todos.status), todos.dueAt, desc(todos.createdAt));
		return rows.map((r) => this.view(scope.orgId, r.t));
	}

	async create(scope: MailScope, input: CreateTodoInput): Promise<TodoView> {
		const [row] = await this.db
			.insert(todos)
			.values({
				organizationId: scope.orgId,
				userId: scope.userId,
				contentEnc: orgCipher(scope.orgId).enc({ title: input.title.trim(), notes: input.notes?.trim() || null }),
				dueAt: input.dueAt ? new Date(input.dueAt) : null,
				source: "manual",
			})
			.returning();
		return this.view(scope.orgId, row);
	}

	private async owned(scope: MailScope, id: string): Promise<Todo> {
		const [t] = await this.db
			.select()
			.from(todos)
			.where(and(eq(todos.id, id), eq(todos.organizationId, scope.orgId), eq(todos.userId, scope.userId)))
			.limit(1);
		if (!t) throw new ApiError(404, "To-do not found", "todo_not_found");
		return t;
	}

	async update(scope: MailScope, id: string, input: UpdateTodoInput): Promise<TodoView> {
		const t = await this.owned(scope, id);
		const cipher = orgCipher(scope.orgId);
		const cur = cipher.dec<TodoContent>(t.contentEnc) ?? { title: "", notes: null };
		const patch: Partial<Todo> = {};
		if (input.title !== undefined || input.notes !== undefined) {
			patch.contentEnc = cipher.enc({
				title: input.title?.trim() ?? cur.title,
				notes: input.notes !== undefined ? input.notes?.trim() || null : cur.notes,
			});
		}
		if (input.dueAt !== undefined) patch.dueAt = input.dueAt ? new Date(input.dueAt) : null;
		if (input.status) {
			patch.status = input.status;
			patch.completedAt = input.status === "done" ? new Date() : null;
		}
		const [row] = await this.db.update(todos).set(patch).where(eq(todos.id, t.id)).returning();
		return this.view(scope.orgId, row);
	}

	async remove(scope: MailScope, id: string) {
		const t = await this.owned(scope, id);
		await this.db.delete(todos).where(eq(todos.id, t.id));
	}

	/** Idempotent per source message; never overwrites a user's edits. */
	async upsertAi(scope: MailScope, messageId: string, threadId: string | null, todo: { title: string; dueAt: string | null }) {
		const due = todo.dueAt && !Number.isNaN(Date.parse(todo.dueAt)) ? new Date(todo.dueAt) : null;
		const rows = await this.db
			.insert(todos)
			.values({
				organizationId: scope.orgId,
				userId: scope.userId,
				contentEnc: orgCipher(scope.orgId).enc({ title: todo.title.trim().slice(0, 300), notes: null }),
				dueAt: due,
				source: "ai",
				messageId,
				threadId,
			})
			.onConflictDoNothing({ target: [todos.organizationId, todos.userId, todos.messageId] })
			.returning({ id: todos.id });
		return rows.length > 0;
	}
}
