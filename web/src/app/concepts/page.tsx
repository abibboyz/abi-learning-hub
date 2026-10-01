import Link from "next/link";

const REFS = [
  {
    title: "SQLAlchemy 2.0 — ORM relationships",
    url: "https://docs.sqlalchemy.org/en/20/orm/basic_relationships.html",
  },
  {
    title: "Prisma — Relations",
    url: "https://www.prisma.io/docs/orm/prisma-schema/data-model/relations",
  },
  {
    title: "Drizzle ORM — Relations",
    url: "https://orm.drizzle.team/docs/relations",
  },
  { title: "Zod", url: "https://zod.dev/" },
  {
    title: "PostgreSQL — Foreign keys",
    url: "https://www.postgresql.org/docs/current/ddl-constraints.html#DDL-CONSTRAINTS-FK",
  },
  {
    title: "Next.js — Route Handlers",
    url: "https://nextjs.org/docs/app/building-your-application/routing/route-handlers",
  },
];

export default function ConceptsPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-8 px-6 py-10">
      <header className="space-y-3">
        <p className="text-xs uppercase tracking-[0.2em] text-accent">Handbook</p>
        <h1 className="text-3xl font-semibold text-white">Concepts & references</h1>
        <p className="text-ink-300">
          Full conceptual documentation lives in the repository root as{" "}
          <code className="text-accent">CONCEPTS.md</code>. Interactive topic mode mirrors it with
          why, pitfalls, and SQL↔ORM mapping per track.
        </p>
      </header>

      <section className="card p-5 space-y-2">
        <h2 className="font-medium text-white">What you will learn</h2>
        <ul className="list-disc space-y-2 pl-5 text-ink-300">
          <li>Engines, clients, and connection strings — why credentials stay server-side</li>
          <li>Tables, columns, primary keys, foreign keys</li>
          <li>1:N, N:1, 1:1, M:N, self-referential relationships</li>
          <li>Cascades, loading strategies, joins</li>
          <li>Where DB code lives: API / Next.js BFF vs browser</li>
          <li>ORM ↔ SQL mental model + validation (Zod / Pydantic)</li>
        </ul>
      </section>

      <section className="card p-5 space-y-3">
        <h2 className="font-medium text-white">Official references</h2>
        <ul className="space-y-2 text-sm">
          {REFS.map((r) => (
            <li key={r.url}>
              <a
                href={r.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
              >
                {r.title}
              </a>
            </li>
          ))}
        </ul>
      </section>

      <p className="text-sm text-ink-400">
        Continue in{" "}
        <Link className="text-accent underline" href="/lab?mode=topics">
          Topic-by-topic mode
        </Link>{" "}
        — same platform, pick any track in the lab picker.
      </p>
    </div>
  );
}
