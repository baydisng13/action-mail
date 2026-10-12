import { Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { AccountController } from "./account/account.controller";
import { AdminController } from "./admin/admin.controller";
import { AdminPaymentsController } from "./admin/admin-payments.controller";
import { PlatformSettingsController } from "./admin/platform-settings.controller";
import { AuthController } from "./auth/auth.controller";
import { BillingController } from "./billing/billing.controller";
import { AuthGuard } from "./common/auth";
import { ApiExceptionFilter } from "./common/errors";
import { RateLimitGuard } from "./common/rate-limit";
import { CoreModule } from "./core.module";
import { HealthController } from "./health/health.controller";
import { MailController } from "./mail/mail.controller";
import { OrgsController } from "./orgs/orgs.controller";
import { PaymentsController } from "./payments/payments.controller";
import { TodosController } from "./todos/todos.controller";

@Module({
	imports: [CoreModule],
	controllers: [
		HealthController,
		AuthController,
		AccountController,
		OrgsController,
		BillingController,
		AdminController,
		AdminPaymentsController,
		PlatformSettingsController,
		MailController,
		PaymentsController,
		TodosController,
	],
	providers: [
		{ provide: APP_GUARD, useClass: AuthGuard },
		{ provide: APP_FILTER, useClass: ApiExceptionFilter },
		RateLimitGuard,
	],
})
export class AppModule {}
