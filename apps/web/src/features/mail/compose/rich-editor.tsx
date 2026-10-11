import Placeholder from "@tiptap/extension-placeholder";
import { type Editor, EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
	Bold,
	Italic,
	Link as LinkIcon,
	List,
	ListOrdered,
	Quote,
	Redo2,
	Underline as UnderlineIcon,
	Undo2,
} from "lucide-react";
import { useEffect } from "react";
import { cn } from "@/lib/utils";

/** TipTap rich text body. `value` is only read on mount and when `resetKey` changes. */
export function RichEditor({
	value,
	resetKey,
	onChange,
}: {
	value: string;
	resetKey: string;
	onChange: (html: string) => void;
}) {
	const editor = useEditor({
		immediatelyRender: false,
		extensions: [
			StarterKit.configure({ link: { openOnClick: false, autolink: true } }),
			Placeholder.configure({ placeholder: "Write your message" }),
		],
		content: value,
		editorProps: {
			attributes: {
				class: "compose-body min-h-[180px] px-4 py-3 text-sm leading-relaxed outline-none",
				"data-testid": "compose-body",
			},
		},
		onUpdate: ({ editor }) => onChange(editor.getHTML()),
	});

	// biome-ignore lint/correctness/useExhaustiveDependencies: reset only when the draft changes
	useEffect(() => {
		if (editor && editor.getHTML() !== value) editor.commands.setContent(value, { emitUpdate: false });
	}, [editor, resetKey]);

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<div className="min-h-0 flex-1 overflow-y-auto">
				<EditorContent editor={editor} />
			</div>
			{editor && <Toolbar editor={editor} />}
		</div>
	);
}

function Toolbar({ editor }: { editor: Editor }) {
	const btn = (active: boolean, label: string, onClick: () => void, icon: React.ReactNode) => (
		<button
			type="button"
			aria-label={label}
			title={label}
			onMouseDown={(e) => e.preventDefault()}
			onClick={onClick}
			className={cn(
				"flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground",
				active && "bg-white/[0.08] text-foreground",
			)}
		>
			{icon}
		</button>
	);
	const c = () => editor.chain().focus();
	return (
		<div className="flex flex-wrap items-center gap-0.5 px-2 py-1">
			{btn(editor.isActive("bold"), "Bold", () => c().toggleBold().run(), <Bold className="h-4 w-4" />)}
			{btn(editor.isActive("italic"), "Italic", () => c().toggleItalic().run(), <Italic className="h-4 w-4" />)}
			{btn(editor.isActive("underline"), "Underline", () => c().toggleUnderline().run(), <UnderlineIcon className="h-4 w-4" />)}
			{btn(editor.isActive("bulletList"), "Bulleted list", () => c().toggleBulletList().run(), <List className="h-4 w-4" />)}
			{btn(editor.isActive("orderedList"), "Numbered list", () => c().toggleOrderedList().run(), <ListOrdered className="h-4 w-4" />)}
			{btn(editor.isActive("blockquote"), "Quote", () => c().toggleBlockquote().run(), <Quote className="h-4 w-4" />)}
			{btn(editor.isActive("link"), "Link", () => {
				if (editor.isActive("link")) {
					c().unsetLink().run();
					return;
				}
				const url = window.prompt("Link address");
				if (url) c().extendMarkRange("link").setLink({ href: /^https?:|^mailto:/.test(url) ? url : `https://${url}` }).run();
			}, <LinkIcon className="h-4 w-4" />)}
			<span className="mx-1 h-4 w-px bg-white/10" />
			{btn(false, "Undo", () => c().undo().run(), <Undo2 className="h-4 w-4" />)}
			{btn(false, "Redo", () => c().redo().run(), <Redo2 className="h-4 w-4" />)}
		</div>
	);
}
