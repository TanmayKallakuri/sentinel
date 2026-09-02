import type { Grade } from "@/lib/types";

// Green through red, never blue: a grade is a judgement, and it should not look
// like a link or like neutral chrome.
const GRADE_CLASS: Record<Grade, string> = {
  A: "grade-a",
  B: "grade-b",
  C: "grade-c",
  D: "grade-d",
  F: "grade-f",
};

function toneFor(grade: string): string {
  return grade in GRADE_CLASS ? GRADE_CLASS[grade as Grade] : "grade-neutral";
}

/**
 * The grade as a filled block. Sample summaries hand the letter over as a plain
 * string, so an unrecognised letter still renders rather than throwing.
 */
export function GradeBadge({ grade, small = false }: { grade: string; small?: boolean }) {
  return (
    <div
      className={`grade ${toneFor(grade)}${small ? " grade-sm" : ""}`}
      role="img"
      aria-label={`Grade ${grade}`}
    >
      {grade}
    </div>
  );
}
