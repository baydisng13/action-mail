import { Link } from "@tanstack/react-router";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

const FAQ: Array<[string, React.ReactNode]> = [
	["Do I have to move my email to Postscript?", "No. Your mail stays with Gmail or your current provider. Postscript connects to it and shows it in a calmer way. You can stop any time."],
	["Which email providers work?", "Gmail through Google sign-in, and almost any other provider through IMAP: Outlook, Yahoo, iCloud, Zoho, Fastmail and cPanel hosting."],
	[
		"Do you store my emails?",
		<>
			No. Message bodies and attachments are never saved. We keep only what the inbox list needs (like sender and subject), encrypted. Read the{" "}
			<Link to="/privacy" className="underline">privacy page</Link> for the details.
		</>,
	],
	["What is an AI action?", "One AI task on one email, like pulling out a code, a link or a to-do, or writing a short summary. The free plan includes 50 a month."],
	["How does the Team plan work?", "You pay per seat. Everyone in the team workspace gets Pro limits, and there is one bill. Each person only sees their own mailboxes."],
	["Can I cancel?", "Yes. Cancel from Settings, Plan and billing. You keep paid features until the end of the period you paid for."],
];

export function Faq() {
	return (
		<div id="faq">
			<h2 className="font-display text-4xl tracking-tight">Questions</h2>
			<Accordion type="single" collapsible className="mt-6">
				{FAQ.map(([q, a]) => (
					<AccordionItem key={q} value={q} className="border-white/[0.06]">
						<AccordionTrigger className="text-left text-base">{q}</AccordionTrigger>
						<AccordionContent className="text-muted-foreground">{a}</AccordionContent>
					</AccordionItem>
				))}
			</Accordion>
		</div>
	);
}
