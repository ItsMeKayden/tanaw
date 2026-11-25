import { redirect } from "next/navigation";

type PageProps = Readonly<{ searchParams: Promise<{ cycle?: string; campus?: string }> }>;

/** Passing Rate is now part of Schools & Passing Rate; keep old links working. */
export default async function PassingRatePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const search = new URLSearchParams();
  if (params.cycle) search.set("cycle", params.cycle);
  if (params.campus && params.campus !== "all") search.set("campus", params.campus);
  const query = search.toString();
  redirect(`/reports/top-schools${query ? `?${query}` : ""}`);
}
