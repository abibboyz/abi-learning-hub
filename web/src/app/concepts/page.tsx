export default function ConceptsPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-3xl font-semibold text-white">Concepts</h1>
      <p className="mt-4 text-slate-300">
        Full conceptual documentation lives in the repository root as{" "}
        <code className="text-accent">CONCEPTS.md</code> (SQLAlchemy-docs style), covering Python
        SQLAlchemy, Node Prisma/Drizzle/pg, raw SQL mappings, and validation with Zod, Valibot, and
        ArkType.
      </p>
      <ul className="mt-6 list-disc space-y-2 pl-5 text-slate-300">
        <li>Engines, clients, and connection strings</li>
        <li>Tables, columns, primary keys, foreign keys</li>
        <li>1:N, N:1, 1:1, M:N, self-referential relationships</li>
        <li>Cascades, loading strategies, joins</li>
        <li>Where DB code lives: Plain Node vs React SPA vs Next.js App Router</li>
        <li>ORM ↔ SQL mental model</li>
      </ul>
      <p className="mt-6 text-sm text-slate-400">
        Use{" "}
        <a className="text-accent underline" href="/lab?mode=topics">
          Topic-by-topic mode
        </a>{" "}
        in the lab for interactive examples and exercises per concept.
      </p>
    </main>
  );
}
