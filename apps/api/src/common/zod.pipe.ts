import { Body, type PipeTransform, Query } from "@nestjs/common";
import type { ZodType } from "zod";

class ZodPipe<T> implements PipeTransform {
	constructor(private readonly schema: ZodType<T>) {}
	transform(value: unknown): T {
		return this.schema.parse(value ?? {});
	}
}

/** `@ZBody(schema)` validates the request body with a shared contract schema. */
export const ZBody = <T>(schema: ZodType<T>) => Body(new ZodPipe(schema));
export const ZQuery = <T>(schema: ZodType<T>) => Query(new ZodPipe(schema));
