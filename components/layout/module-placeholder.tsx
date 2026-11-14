type ModulePlaceholderProps = {
  title: string;
  description: string;
};

export function ModulePlaceholder({
  title,
  description,
}: ModulePlaceholderProps) {
  return (
    <section className="p-6">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{description}</p>

      <div className="mt-6 rounded-md border border-dashed border-neutral-300 p-8 text-center">
        <p className="text-sm text-muted-foreground">
          This module is currently under development.
        </p>
      </div>
    </section>
  );
}
