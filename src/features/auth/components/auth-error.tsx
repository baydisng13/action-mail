import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { getApiError } from "@/lib/api-client";

/** Renders a server/mutation error as a shadcn destructive Alert, or nothing. */
export function AuthError({ error }: { error: unknown }) {
	if (!error) return null;
	const { message } = getApiError(error);
	return (
		<Alert variant="destructive" className="animate-fade-in">
			<AlertCircle className="h-4 w-4" />
			<AlertDescription>{message}</AlertDescription>
		</Alert>
	);
}
