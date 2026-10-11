import type { ComposeMode } from "@postscript/types";
import { createContext, useCallback, useContext, useMemo, useState } from "react";

export interface ComposeRequest {
	mode: ComposeMode;
	sourceMessageId?: string;
	/** Reopen an existing draft (after undo send, or a local draft). */
	draftId?: string;
	mailboxId?: string;
}

interface ComposeState {
	request: (ComposeRequest & { key: number }) | null;
	open: (r: ComposeRequest) => void;
	close: () => void;
}

const Ctx = createContext<ComposeState | null>(null);

export function ComposeProvider({ children }: { children: React.ReactNode }) {
	const [request, setRequest] = useState<ComposeState["request"]>(null);
	const open = useCallback((r: ComposeRequest) => setRequest({ ...r, key: Date.now() }), []);
	const close = useCallback(() => setRequest(null), []);
	const value = useMemo(() => ({ request, open, close }), [request, open, close]);
	return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCompose(): ComposeState {
	const c = useContext(Ctx);
	if (!c) throw new Error("useCompose outside ComposeProvider");
	return c;
}
