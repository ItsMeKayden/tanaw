// Sends sample exam result emails to YOUR address so you can check each one.
// Uses made-up applicant details; no database access, no applicant is emailed.
//
//   npm run email:test-results -- you@example.com                 all 6 emails
//   npm run email:test-results -- you@example.com --only failed   one outcome (passed | waitlisted | failed)
//   npm run email:test-results -- you@example.com --new           first results only (no "Updated" versions)
//   npm run email:test-results -- --preview                       send nothing; print them and save HTML files
import "dotenv/config";

import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildResultEmail } from "../features/admission/result-email-template";
import { ADMISSION_STAGES } from "../features/admission/stages";
import { isMailConfigured, sendMail } from "../lib/mailer";

const OUTCOMES = {
  passed: { stage: ADMISSION_STAGES.PASSED, score: 86.5 },
  waitlisted: { stage: ADMISSION_STAGES.WAITLISTED, score: 78.25 },
  failed: { stage: ADMISSION_STAGES.FAILED, score: 41.0 },
} as const;
type Outcome = keyof typeof OUTCOMES;

const args = process.argv.slice(2);
const preview = args.includes("--preview");
const onlyNew = args.includes("--new");
const onlyIndex = args.indexOf("--only");
const only = onlyIndex >= 0 ? args[onlyIndex + 1]?.toLowerCase() : null;
const to = args.find((arg, index) => !arg.startsWith("--") && index !== onlyIndex + 1);

function fail(message: string): never {
  console.error(`${message}\n\nUsage: npm run email:test-results -- you@example.com [--only passed|waitlisted|failed] [--new] [--preview]`);
  process.exit(1);
}

if (only && !(only in OUTCOMES)) fail(`Unknown outcome "${only}".`);
if (!preview && !to) fail("Give the address to send the test emails to, or use --preview.");
if (!preview && !isMailConfigured()) {
  console.warn("SMTP_HOST is not set in .env, so the emails will only be printed below, not sent.\n");
}

async function main() {
  const outcomes = (only ? [only] : Object.keys(OUTCOMES)) as Outcome[];
  const variants = onlyNew ? [false] : [false, true];
  const previewDir = join(tmpdir(), "tanaw-email-preview");
  if (preview) mkdirSync(previewDir, { recursive: true });

  let count = 0;
  for (const outcome of outcomes) {
    for (const isUpdate of variants) {
      const message = buildResultEmail(to ?? "preview@example.com", OUTCOMES[outcome].stage, isUpdate, {
        firstName: "Juan",
        applicationNo: "TEST-2026-0001",
        program: "BS Information Technology (BSIT)",
        campus: "San Bartolome Campus",
        schoolYear: "2026-2027",
        score: OUTCOMES[outcome].score,
      })!;
      const label = `${outcome}${isUpdate ? " (updated)" : ""}`;

      if (preview) {
        const file = join(previewDir, `${outcome}${isUpdate ? "-updated" : ""}.html`);
        writeFileSync(file, `<!doctype html><meta charset="utf-8"><title>${message.subject}</title>${message.html}`);
        console.log(`--- ${label} ---\nSubject: ${message.subject}\n\n${message.text}\n\nHTML: ${file}\n`);
      } else {
        await sendMail(message);
        console.log(`Sent: ${label}  →  "${message.subject}"`);
      }
      count++;
    }
  }
  console.log(preview ? `Previewed ${count} email(s). Open the HTML files above in a browser.` : `Done: ${count} email(s) to ${to}.`);
}

main().catch((error) => {
  console.error("Sending the test emails failed:", error);
  process.exit(1);
});
