import Link from "next/link";
import { TrackCards } from "@/components/lab/TrackCards";

export default function HomePage() {
  return (
    <div className="mx-auto max-w-6xl space-y-10 px-4 py-10 animate-fade-up">
      <header className="space-y-4">
        <p className="text-xs uppercase tracking-[0.2em] text-accent">abi-learning-hub</p>
        <h1 className="text-4xl font-semibold tracking-tight text-white md:text-5xl">
          Learn database relationships
          <span className="block text-accent">across Python, TypeScript & JavaScript</span>
        </h1>
        <p className="max-w-2xl text-ink-300">
          Pluggable tracks, live schema diagram, task gate (validate before you celebrate),
          topic mode, execute-only drills, Zod/SQL side-by-side, and durable progress.
        </p>
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
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        {[
          {
            t: "Prerequisites unlock",
            d: "Connection strings, Base/Prisma client, install commands — read-only until you unlock.",
          },
          {
            t: "ORM ↔ SQL mapping",
            d: "Every task shows equivalent CREATE TABLE / JOINs next to your model code.",
          },
          {
            t: "Export & restore",
            d: "pg_dump snapshots via UI + scripts. Named volumes keep lab state across restarts.",
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
