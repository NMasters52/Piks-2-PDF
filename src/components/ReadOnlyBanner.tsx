export function ReadOnlyBanner() {
  return (
    <div
      role="alert"
      className="mb-4 border border-foreground bg-card px-3 py-2 text-sm"
    >
      Another tab is editing this walk. This tab is read-only.
    </div>
  );
}