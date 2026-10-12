/**
 * REST surface of apps/api (all under /api). Kept here so web and api agree.
 * Auth: Authorization: Bearer <accessToken>; refresh token is an httpOnly
 * cookie scoped to /api on the api host. Errors: { error: { message, code } }.
 *
 * Public
 *   GET  /health                          db + redis status
 *   GET  /config                          { features, plans, billingConfigured }
 *   POST /auth/register|login|refresh|logout|verify-email|resend-verification|forgot-password|reset-password
 *   GET  /auth/google  -> redirect,  GET /auth/google/callback
 *   GET  /invites/:token                  invite preview
 *   POST /billing/webhook                 Polar (signature verified)
 *   GET  /attachments/:messageId/:attachmentId?exp&sig   signed download
 *
 * Account
 *   GET  /me                              MeResponse
 *   POST /auth/change-password
 *   PATCH /account/profile                { fullName }
 *   GET  /account/export                  JSON of everything stored about you
 *   POST /account/delete                  { password?, confirm: "DELETE" }
 *
 * Workspaces
 *   GET  /orgs  POST /orgs {name} -> { organization, accessToken }
 *   POST /orgs/switch {organizationId} -> { accessToken }
 *   PATCH /orgs/current {name}   DELETE /orgs/current
 *   GET  /orgs/current/members -> { members, invites }
 *   POST /orgs/current/invites {email, role} -> InviteView
 *   DELETE /orgs/current/invites/:id
 *   PATCH /orgs/current/members/:userId {role}   DELETE /orgs/current/members/:userId
 *   POST /invites/accept {token} -> { accessToken, organizationId }
 *
 * Billing
 *   GET /billing -> BillingSummary   POST /billing/checkout -> { url }   POST /billing/portal -> { url }
 *
 * Admin (PLATFORM_ADMIN_EMAILS)
 *   GET /admin/overview  GET /admin/orgs?q=  GET /admin/users?q=
 *   POST /admin/orgs/:id/grant {plan, seats}   POST /admin/orgs/:id/suspend {suspended, reason}
 *   GET  /admin/settings -> PlatformSettingsResponse
 *   PUT  /admin/settings {updates: Record<key,value>}  ("" clears the ui override)
 *   POST /admin/settings/test/:group  (google|ai|email|payments) {testAddress?} -> SettingTestResult
 *
 * Mail
 *   GET  /mailboxes -> { mailboxes }      PATCH /mailboxes/:id   DELETE /mailboxes/:id
 *   POST /mailbox/google -> { url }       GET /mailbox/google/callback
 *   POST /mailbox/imap -> { mailboxId }
 *   POST /mailboxes/:id/sync              POST /mailboxes/refresh (poll new mail)
 *   GET  /folders?mailboxId= -> { folders: FolderView[] }
 *   GET  /threads?view&mailboxId&labelId&category&unread&starred&attachments&offset -> ThreadListResponse
 *   GET  /search?q&from&mailboxId&unread&starred&attachments -> ThreadListResponse (provider search)
 *   GET  /threads/:id?images=1 -> ThreadDetail  (marks read)
 *   POST /threads/actions {threadIds, action, folderId?, until?}
 *   GET  /threads/:id/ai/actions -> { actions }   GET /threads/:id/ai/summary -> { summaries }
 *
 * Compose
 *   POST /drafts {mailboxId?, mode, sourceMessageId?} -> DraftView (prefilled)
 *   GET  /drafts/:id -> DraftView   PUT /drafts/:id DraftContent -> { version }   DELETE /drafts/:id
 *   POST /drafts/:id/send DraftContent -> SendResponse
 *   POST /outbox/:id/undo -> { draftId }
 *   POST /uploads (multipart "file") -> UploadView
 *
 * To-dos
 *   GET /todos?mailboxId=  POST /todos  PATCH /todos/:id  DELETE /todos/:id  POST /todos/scan
 */
export const API_PREFIX = "/api";
