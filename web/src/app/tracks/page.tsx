import { TrackCards } from "@/components/lab/TrackCards";

export default function TracksPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 space-y-6">
      <h1 className="text-3xl font-semibold text-white">Tracks</h1>
      <p className="text-ink-300 max-w-2xl">
        Pluggable track packages live under <code className="text-accent">tracks/</code>. Pick one
        here to learn — the platform stays the same. Adding a future track means a new manifest +
        lessons + tasks, not a new Docker stack.
      </p>
      <TrackCards />
    </div>
  );
}
