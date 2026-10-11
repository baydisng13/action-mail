import { Module } from "@nestjs/common";
import { CoreModule } from "../core.module";
import { WorkerService } from "./worker.service";

@Module({ imports: [CoreModule], providers: [WorkerService] })
export class WorkerModule {}
