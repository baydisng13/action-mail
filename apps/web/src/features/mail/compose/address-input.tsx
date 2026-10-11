import { X } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

const EMAIL = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;

/** Recipients as removable chips. Enter, comma, space or blur commits what you typed. */
export function AddressInput({
	label,
	value,
	onChange,
	autoFocus,
	testId,
}: {
	label: string;
	value: string[];
	onChange: (v: string[]) => void;
	autoFocus?: boolean;
	testId?: string;
}) {
	const [draft, setDraft] = useState("");
	const [error, setError] = useState(false);

	const commit = (raw: string) => {
		const parts = raw
			.split(/[,;\s]+/)
			.map((p) => p.replace(/^.*<(.+)>.*$/, "$1").trim())
			.filter(Boolean);
		if (parts.length === 0) return true;
		const good = parts.filter((p) => EMAIL.test(p));
		const bad = parts.filter((p) => !EMAIL.test(p));
		if (good.length) onChange([...value, ...good.filter((g) => !value.includes(g))]);
		setDraft(bad.join(" "));
		setError(bad.length > 0);
		return bad.length === 0;
	};

	return (
		<div className="flex min-h-10 flex-wrap items-center gap-1.5 px-4 py-1.5">
			<span className="w-10 shrink-0 text-sm text-muted-foreground">{label}</span>
			{value.map((v) => (
				<span key={v} className="inline-flex items-center gap-1 rounded-md bg-white/[0.07] py-0.5 pr-1 pl-2 text-sm">
					{v}
					<button
						type="button"
						aria-label={`Remove ${v}`}
						className="rounded p-0.5 text-muted-foreground hover:text-foreground"
						onClick={() => onChange(value.filter((x) => x !== v))}
					>
						<X className="h-3 w-3" />
					</button>
				</span>
			))}
			<input
				data-testid={testId}
				autoFocus={autoFocus}
				value={draft}
				onChange={(e) => {
					setError(false);
					const v = e.target.value;
					if (/[,;]$/.test(v)) commit(v.slice(0, -1));
					else setDraft(v);
				}}
				onKeyDown={(e) => {
					if (e.key === "Enter" || e.key === " " || e.key === "Tab") {
						if (draft.trim()) {
							if (e.key !== "Tab") e.preventDefault();
							commit(draft);
						}
					} else if (e.key === "Backspace" && !draft && value.length) {
						onChange(value.slice(0, -1));
					}
				}}
				onBlur={() => commit(draft)}
				onPaste={(e) => {
					e.preventDefault();
					commit(draft + e.clipboardData.getData("text"));
				}}
				className={cn(
					"min-w-[8rem] flex-1 bg-transparent py-1 text-sm outline-none placeholder:text-muted-foreground/60",
					error && "text-destructive",
				)}
				placeholder={value.length ? "" : "name@example.com"}
			/>
		</div>
	);
}

/** Commits any half-typed address before send. */
export function pendingAddresses(list: string[]): string[] {
	return list.filter((x) => EMAIL.test(x));
}
