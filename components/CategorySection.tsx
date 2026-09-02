import type { CategoryScore } from "@/lib/types";
import { FindingRow } from "./FindingRow";

export function CategorySection({ category }: { category: CategoryScore }) {
  // Earned over assessed, not over weight: points that could not be assessed
  // left both sides of the ratio and must not read as points lost.
  const ratio =
    category.pointsAvailable === 0 ? 0 : (category.pointsEarned / category.pointsAvailable) * 100;
  const filled = Math.max(0, Math.min(100, ratio));

  return (
    <section className="card">
      <header className="cat-head">
        <h2 className="cat-name">{category.label}</h2>
        <span className="mono cat-points">
          {category.pointsEarned} / {category.pointsAvailable} points
        </span>
      </header>
      <div className="bar">
        <span style={{ width: `${filled}%` }} />
      </div>
      <p className="muted mono">Category weight {category.weight} of 100</p>
      {category.pointsNotAssessed > 0 ? (
        <p className="muted sub-note">
          {category.pointsNotAssessed} of the {category.weight} points in this category were not
          assessed. They are excluded from both sides of the score.
        </p>
      ) : null}
      <ul className="findings">
        {category.findings.map((finding) => (
          <FindingRow key={finding.id} finding={finding} />
        ))}
      </ul>
    </section>
  );
}
