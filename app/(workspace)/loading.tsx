export default function WorkspaceLoading() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="m-2 flex min-h-32 flex-1 items-center justify-center border border-neutral-400 text-sm text-muted-foreground"
    >
      Loading...
    </div>
  );
}
