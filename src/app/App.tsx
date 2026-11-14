// UI agent owns src/app/ and src/components/. Code against the contracts in
// src/types/walk.ts + src/lib/db.ts (WalkStore), src/lib/images.ts,
// src/lib/pdf.ts. Inject the store (do not hard-import createWalkStore deep
// in components) so interaction tests can supply a fake WalkStore.
export default function App() {
  return (
    <main className="mx-auto max-w-xl p-4">
      <h1 className="text-xl font-bold">Pik-2-PDF</h1>
      <p className="mt-2 text-sm">
        Foundation scaffold — UI agent replaces this with the full walk UI
        (capture/library input, notes, capacity, pause/resume, save status,
        export, clear confirmation).
      </p>
    </main>
  );
}
