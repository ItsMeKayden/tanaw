export default function ForbiddenPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-6 text-center">
      <div className="max-w-md">
        <h1 className="text-2xl font-bold text-neutral-900">403 - Access denied</h1>
        <p className="mt-2 text-sm text-neutral-600">
          You do not have permission to access this page. Contact an administrator if you believe this is a mistake.
        </p>
      </div>
    </main>
  );
}
