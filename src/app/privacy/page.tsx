import Link from "next/link";

export default function PrivacyPage() {
  return (
    <main style={{ minHeight: "100dvh", padding: "56px 24px", background: "var(--background)", color: "var(--primary)" }}>
      <article style={{ maxWidth: 720, margin: "0 auto", padding: 28, border: "1px solid var(--border)", borderRadius: 20, background: "var(--surface)" }}>
        <Link href="/" style={{ color: "#22a967", fontSize: 14, fontWeight: 750, textDecoration: "none" }}>← Committed</Link>
        <h1 style={{ margin: "20px 0 8px", fontSize: 32 }}>Privacy Policy</h1>
        <p style={{ margin: 0, color: "var(--secondary)", fontSize: 14 }}>Last updated: September 2, 2026</p>

        <Section title="What Committed stores">
          Committed stores the account information and productivity data needed to provide the app, such as habits, goals, tasks, and settings.
        </Section>
        <Section title="Google Calendar">
          If you choose to connect Google Calendar, Committed requests read-only access to the calendars and events you select. This data is used only to display your schedule inside Committed. Committed does not create, edit, or delete Google Calendar events.
        </Section>
        <Section title="Sharing">
          Committed does not sell your personal information or Google Calendar data. Your data is not shared with advertisers.
        </Section>
        <Section title="Your choices">
          You can disconnect Google Calendar at any time and can revoke Committed&apos;s Google Calendar access from your Google Account permissions page. You can also contact us to ask questions about your data.
        </Section>
        <Section title="Contact">
          For privacy questions, contact the Committed developer through the support email shown in the app&apos;s Google consent screen.
        </Section>
      </article>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section style={{ marginTop: 25 }}><h2 style={{ margin: "0 0 8px", fontSize: 18 }}>{title}</h2><p style={{ margin: 0, color: "var(--secondary)", fontSize: 15, lineHeight: 1.65 }}>{children}</p></section>;
}
