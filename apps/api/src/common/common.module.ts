import { Global, Module } from "@nestjs/common";
import { ContentCache } from "./content-cache";

@Global()
@Module({ providers: [ContentCache], exports: [ContentCache] })
export class CommonModule {}
