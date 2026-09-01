// Evaluates the cookbook example's validator against every line of the shared
// input file inside a single process, and prints one JSON verdict array.
//
// The example exports parseDomainArgument and runs its CLI body only under an
// import.meta.main guard, so importing it here is a pure module load: no browser
// session, no sandbox, no network. That guard and that one export are the only
// concessions the deliverable makes to being tested.
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

const example = (await import(pathToFileURL(forkIndex).href)) as {
  parseDomainArgument: (raw: string | undefined) => string;
};

const verdicts = inputs.map((input) => {
  try {
    return { input, verdict: `accept ${example.parseDomainArgument(input)}` };
  } catch {
    // A thrown refusal is the example's reject path, not a driver failure.
    return { input, verdict: "reject" };
  }
});

console.log(JSON.stringify(verdicts));
