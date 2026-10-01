import Link from "next/link";
import { TrackCards } from "@/components/lab/TrackCards";

export default function HomePage() {
  return (
    <div className="mx-auto max-w-6xl space-y-10 px-4 py-10 animate-fade-up">
      <header className="space-y-4">
        <p className="text-xs uppercase tracking-[0.2em] text-accent">One platform · one command</p>
        <h1 className="text-4xl font-semibold tracking-tight text-white md:text-5xl">
          Learn database relationships
          <span className="block text-accent">pick a track in the UI</span>
        </h1>
        <p className="max-w-2xl text-ink-300">
          <strong className="text-ink-100">docker compose up --build</strong> starts the whole hub.
          Open this app, choose Python · SQLAlchemy, Node · TypeScript, or Node · JavaScript —
          no separate stacks, no dual ports to remember.
        </p>
        <ol className="max-w-2xl list-decimal space-y-1 pl-5 text-sm text-ink-300">
          <li>
            Run <code className="text-accent">docker compose up --build</code>
          </li>
          <li>
            Open <code className="text-accent">http://localhost:3000</code>
          </li>
          <li>Select a track below (or in the lab picker) and start learning</li>
        </ol>
        <div className="flex flex-wrap gap-3">
          <Link href="/lab?mode=topics" className="btn-primary">
            Topic-by-topic mode
          </Link>
          <Link href="/lab?mode=execute" className="btn-ghost">
            Execute-only tasks
          </Link>
          <Link href="/tracks" className="btn-ghost">
            Browse tracks
          </Link>
          <Link href="/concepts" className="btn-ghost">
            Concepts & references
          </Link>
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-3" aria-label="Platform highlights">
        {[
          {
            t: "Single public entry",
            d: "Only the web UI is learner-facing. /api/* BFF reaches internal runners — you never start Python vs Node Docker separately.",
          },
          {
            t: "Why · pitfalls · references",
            d: "Every topic and task explains cause→effect, common mistakes, SQL↔ORM mapping, and links to official docs.",
          },
          {
            t: "Task gate + teach-along",
            d: "Validate against Postgres before celebrating. Diagram highlights narrate what changed when you pass.",
          },
        ].map((x) => (
          <div key={x.t} className="card p-5">
            <h3 className="font-medium text-white">{x.t}</h3>
            <p className="mt-2 text-sm text-ink-300">{x.d}</p>
          </div>
        ))}
      </section>

      <TrackCards />
    </div>
  );
}
