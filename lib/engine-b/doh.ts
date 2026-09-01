export interface DohQuery {
  name: string;
  type: string;
}

export interface DohAnswer {
  name: string;
  type: number;
  data: string;
}

export interface DohSection {
  name: string;
  type: string;
  status: number;
  authenticatedData: boolean;
  answers: DohAnswer[];
}

/**
 * The script takes pairs of arguments, name then type, so the caller controls
 * the query list without any string interpolation into the script body.
 */
export function buildDohScript(): string {
  return `
set -u
while [ "$#" -gt 1 ]; do
  NAME="$1"
  TYPE="$2"
  shift 2
  echo "=== $NAME $TYPE ==="
  curl -sS --max-time 10 -H 'accept: application/dns-json' \\
    "https://cloudflare-dns.com/dns-query?name=$NAME&type=$TYPE" || echo '{"Status":-1}'
  echo
done
`;
}

function isAnswer(value: unknown): value is DohAnswer {
  if (typeof value !== "object" || value === null) return false;
  const answer = value as Partial<DohAnswer>;
  return typeof answer.type === "number" && typeof answer.data === "string";
}

export function parseDohSections(stdout: string): DohSection[] {
  const sections: DohSection[] = [];
  const pattern = /=== (\S+) (\S+) ===\r?\n([\s\S]*?)(?=\r?\n=== |$)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(stdout)) !== null) {
    const [, name = "", type = "", body = ""] = match;
    let status = -1;
    let authenticatedData = false;
    let answers: DohAnswer[] = [];
    try {
      const parsed: unknown = JSON.parse(body.trim());
      const record = (typeof parsed === "object" && parsed !== null ? parsed : {}) as Record<string, unknown>;
      status = typeof record.Status === "number" ? record.Status : -1;
      authenticatedData = record.AD === true;
      answers = Array.isArray(record.Answer) ? record.Answer.filter(isAnswer) : [];
    } catch {
      // A resolver hiccup is reported as unavailable rather than as an absence.
    }
    sections.push({ name, type, status, authenticatedData, answers });
  }
  return sections;
}

export function txtStrings(section: DohSection | undefined): string[] {
  if (!section) return [];
  return section.answers
    .filter((answer) => answer.type === 16)
    .map((answer) => answer.data.replace(/"\s*"/g, "").replace(/^"|"$/g, ""));
}
