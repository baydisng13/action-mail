import { Module } from "@nestjs/common";
import { AccountService } from "./account/account.service";
import { AdminService } from "./admin/admin.service";
import { AiService } from "./ai/ai.service";
import { AuthService } from "./auth/auth.service";
import { SessionService } from "./auth/session.service";
import { BillingService } from "./billing/billing.service";
import { LimitsService } from "./billing/limits.service";
import { CommonModule } from "./common/common.module";
import { PlatformSettingsService } from "./admin/platform-settings.service";
import { SettingsBootstrapService } from "./config/settings-bootstrap.service";
import { DbModule } from "./db/db.module";
import { EmailModule } from "./email/email.module";
import { ActionsService } from "./mail/actions.service";
import { ComposeService } from "./mail/compose.service";
import { IngestService } from "./mail/ingest.service";
import { MailboxService } from "./mail/mailbox.service";
import { ReadService } from "./mail/read.service";
import { SearchService } from "./mail/search.service";
import { SyncService } from "./mail/sync.service";
import { OrgsService } from "./orgs/orgs.service";
import { QueueModule } from "./queue/queue.module";
import { RedisModule } from "./redis/redis.module";
import { TodosService } from "./todos/todos.service";

const services = [
	AccountService,
	AdminService,
	AiService,
	AuthService,
	SessionService,
	BillingService,
	LimitsService,
	ActionsService,
	ComposeService,
	IngestService,
	MailboxService,
	ReadService,
	SearchService,
	SyncService,
	OrgsService,
	TodosService,
	SettingsBootstrapService,
	PlatformSettingsService,
];

/** Everything shared by the api and the worker (same image, different entry). */
@Module({
	imports: [DbModule, RedisModule, QueueModule, EmailModule, CommonModule],
	providers: services,
	exports: services,
})
export class CoreModule {}
