// Evaluates the cookbook example's validator against every line of the shared
// input file inside a single process, and prints one JSON verdict array.
//
// The example is a CLI with no exports, so each input is evaluated by importing
// it again under a cache busting query, which re-runs its top level body with a
// fresh process.argv. That keeps the deliverable untouched: it stays a plain
// runnable script with nothing added for the sake of being tested.
//
// Usage: tsx differential-driver.mts <fork-index.ts> <inputs.txt>
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const [forkIndex, inputsFile] = process.argv.slice(2);
if (!forkIndex || !inputsFile) {
  throw new Error("usage: differential-driver.mts <fork-index.ts> <inputs.txt>");
}

const inputs = readFileSync(inputsFile, "utf8")
  .split(/\r?\n/)
  .filter((line) => line.length > 0 && !line.startsWith("#"));

const base = pathToFileURL(forkIndex).href;
const realLog = console.log;
let captured = "";
const capture = (...parts: unknown[]) => {
  captured += parts.map(String).join(" ") + "\n";
};

const verdicts: { input: string; verdict: string }[] = [];
for (const input of inputs) {
  captured = "";
  process.argv[2] = input;
  console.log = capture;
  console.error = capture;
  try {
    await import(`${base}?differential=${encodeURIComponent(input)}`);
  } catch {
    // A thrown refusal is the example's reject path, not a driver failure.
  }
  console.log = realLog;
  const domain = /"domain":\s*"([^"]*)"/.exec(captured)?.[1];
  verdicts.push({ input, verdict: domain ? `accept ${domain}` : "reject" });
}

realLog(JSON.stringify(verdicts));

// The example sets process.exitCode = 1 on every refusal, and importing it in
// process means that lands on this driver. Refusals are expected results here,
// not driver failures, so the exit code is cleared after the verdicts are out.
process.exitCode = 0;
