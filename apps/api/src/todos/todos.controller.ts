import { Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from "@nestjs/common";
import { type CreateTodoInput, createTodoSchema, type UpdateTodoInput, updateTodoSchema } from "@postscript/types";
import { AiService } from "../ai/ai.service";
import { Auth, type AuthCtx } from "../common/auth";
import { ZBody } from "../common/zod.pipe";
import { scopeOf } from "../mail/mailbox.service";
import { TodosService } from "./todos.service";

@Controller("todos")
export class TodosController {
	constructor(
		private readonly todos: TodosService,
		private readonly ai: AiService,
	) {}

	@Get()
	async list(@Auth() ctx: AuthCtx, @Query("mailboxId") mailboxId?: string) {
		return { todos: await this.todos.list(scopeOf(ctx), mailboxId || null) };
	}

	@Post()
	create(@Auth() ctx: AuthCtx, @ZBody(createTodoSchema) body: CreateTodoInput) {
		return this.todos.create(scopeOf(ctx), body);
	}

	@HttpCode(200)
	@Post("scan")
	scan(@Auth() ctx: AuthCtx) {
		return this.ai.scanTodos(scopeOf(ctx));
	}

	@Patch(":id")
	update(@Auth() ctx: AuthCtx, @Param("id") id: string, @ZBody(updateTodoSchema) body: UpdateTodoInput) {
		return this.todos.update(scopeOf(ctx), id, body);
	}

	@Delete(":id")
	async remove(@Auth() ctx: AuthCtx, @Param("id") id: string) {
		await this.todos.remove(scopeOf(ctx), id);
		return { ok: true };
	}
}
