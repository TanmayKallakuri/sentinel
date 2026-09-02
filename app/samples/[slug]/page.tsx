import { notFound } from "next/navigation";
import Link from "next/link";
import { ReportView } from "@/components/ReportView";
import { listSampleSlugs, loadSample } from "@/lib/samples";

export async function generateStaticParams() {
  return (await listSampleSlugs()).map((slug) => ({ slug }));
}

export default async function SamplePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const report = await loadSample(slug);
  if (!report) notFound();

  return (
    <main className="wrap">
      <p className="muted mono crumb">
        <Link href="/">Sentinel</Link> / precomputed sample. This page is a stored report from a
        real scan. Opening it runs nothing and spends no Solari credits.
      </p>
      <ReportView report={report} />
    </main>
  );
}
