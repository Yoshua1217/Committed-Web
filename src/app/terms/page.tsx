import Link from "next/link";

export default function TermsPage() {
  return (
    <main style={{ minHeight: "100dvh", padding: "56px 24px", background: "var(--background)", color: "var(--primary)" }}>
      <article style={{ maxWidth: 720, margin: "0 auto", padding: 28, border: "1px solid var(--border)", borderRadius: 20, background: "var(--surface)" }}>
        <Link href="/" style={{ color: "#22a967", fontSize: 14, fontWeight: 750, textDecoration: "none" }}>← Committed</Link>
        <h1 style={{ margin: "20px 0 8px", fontSize: 32 }}>Terms of Service</h1>
        <p style={{ margin: 0, color: "var(--secondary)", fontSize: 14 }}>Last updated: September 2, 2026</p>

        <Section title="Using Committed">
          Committed is a personal productivity app. Use it responsibly and keep your account credentials secure.
        </Section>
        <Section title="Google Calendar connection">
          Connecting Google Calendar is optional. Committed uses the permission you grant only to display the calendars and events you select. You may disconnect the connection at any time.
        </Section>
        <Section title="Availability">
          Committed is provided as-is. Features may change, be updated, or become unavailable as the app evolves.
        </Section>
        <Section title="Contact">
          Questions about these terms can be sent to the Committed developer through the support email shown in the app&apos;s Google consent screen.
        </Section>
      </article>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section style={{ marginTop: 25 }}><h2 style={{ margin: "0 0 8px", fontSize: 18 }}>{title}</h2><p style={{ margin: 0, color: "var(--secondary)", fontSize: 15, lineHeight: 1.65 }}>{children}</p></section>;
}
