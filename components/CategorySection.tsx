import type { CategoryScore } from "@/lib/types";
import { FindingRow } from "./FindingRow";

export function CategorySection({ category }: { category: CategoryScore }) {
  // Earned over assessed, not over weight: points that could not be assessed
  // left both sides of the ratio and must not read as points lost.
  const ratio =
    category.pointsAvailable === 0 ? 0 : (category.pointsEarned / category.pointsAvailable) * 100;
  const filled = Math.max(0, Math.min(100, ratio));

  return (
    <section className="card" style={{ marginBottom: 20 }}>
      <header style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <h2 style={{ fontSize: 18 }}>{category.label}</h2>
        <span className="muted mono" style={{ marginLeft: "auto", whiteSpace: "nowrap" }}>
          {category.pointsEarned} / {category.pointsAvailable} points
        </span>
      </header>
      <div className="bar" style={{ margin: "10px 0 4px" }}>
        <span style={{ width: `${filled}%` }} />
      </div>
      <p className="muted mono" style={{ marginTop: 4 }}>
        Category weight {category.weight} of 100.
      </p>
      {category.pointsNotAssessed > 0 ? (
        <p className="muted" style={{ margin: "8px 0 0" }}>
          {category.pointsNotAssessed} of the {category.weight} points in this category were not
          assessed. They are excluded from both sides of the score.
        </p>
      ) : null}
      <ul style={{ listStyle: "none", margin: "12px 0 0", padding: 0 }}>
        {category.findings.map((finding) => (
          <FindingRow key={finding.id} finding={finding} />
        ))}
      </ul>
    </section>
  );
}
