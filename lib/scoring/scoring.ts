import type { CategoryId, GovernanceSignalId, Grade } from "@/lib/types";

/** Weights sum to 100. Change them here and nowhere else. */
export const WEIGHTS: Record<CategoryId, number> = {
  governance: 25,
  transport: 20,
  headers: 15,
  email: 15,
  dns: 10,
  cve: 15,
};

export const CATEGORY_LABELS: Record<CategoryId, string> = {
  governance: "Governance and compliance",
  transport: "Transport security",
  headers: "Application security headers",
  email: "Email authentication",
  dns: "DNS hygiene",
  cve: "Observed software and public CVEs",
};

/** Points sum to the governance weight of 25. */
export const SIGNAL_POINTS: Record<GovernanceSignalId, number> = {
  soc2: 4,
  iso27001: 3,
  pci_dss: 1,
  gdpr: 2,
  dpa: 2,
  vuln_disclosure: 4,
  bug_bounty: 2,
  subprocessors: 3,
  security_contact: 3,
  status_page: 1,
};

export const GRADE_BANDS: { grade: Grade; min: number }[] = [
  { grade: "A", min: 90 },
  { grade: "B", min: 80 },
  { grade: "C", min: 70 },
  { grade: "D", min: 50 },
  { grade: "F", min: 0 },
];

export function gradeFor(score: number): Grade {
  return GRADE_BANDS.find((band) => score >= band.min)?.grade ?? "F";
}
