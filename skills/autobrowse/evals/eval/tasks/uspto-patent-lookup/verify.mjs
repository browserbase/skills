#!/usr/bin/env node
import { getRunDir, loadOutput, emit, emitNoOutput, check, checkContains, norm } from "../_lib/checks.mjs";

const out = loadOutput(getRunDir());
if (!out) emitNoOutput();

// Patents are immutable — exact ground truth. US 11,000,000 B2:
// "Repositioning wires and methods for repositioning prosthetic heart valve
// devices within a heart chamber...", 4C Medical Technologies, granted
// 2021-05-11, inventors incl. Jason S. Diedering, Saravana B. Kumar.
const inventors = norm(JSON.stringify(out.inventors ?? ""));

emit([
  check("claimed success", out.success === true, JSON.stringify(out.success)),
  check("patent number", String(out.patent_number).replace(/[^0-9]/g, "") === "11000000", JSON.stringify(out.patent_number)),
  checkContains("title", out.title, "repositioning"),
  checkContains("title mentions heart valve", out.title, "heart valve"),
  check("inventor Diedering", inventors.includes("diedering"), inventors.slice(0, 120)),
  checkContains("assignee", out.assignee, "4C Medical"),
  check("grant date", String(out.grant_date).startsWith("2021-05-11"), JSON.stringify(out.grant_date)),
]);
