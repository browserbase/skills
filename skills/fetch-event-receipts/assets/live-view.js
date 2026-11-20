"use strict";

const overallStatus = document.querySelector("#overallStatus");
const browserPlaceholder = document.querySelector("#browserPlaceholder");
const liveBrowser = document.querySelector("#liveBrowser");
let visibleRevision = 0;

function setLiveStatus(status, ready, revision) {
  const messages = {
    waiting: "Waiting for the Browserbase session.",
    connecting: "Connecting to Browserbase.",
    ready: "Browserbase session live.",
    unavailable: "Live session unavailable.",
  };
  overallStatus.textContent = messages[status] || messages.waiting;
  browserPlaceholder.textContent = messages[status] || messages.waiting;
  browserPlaceholder.hidden = ready;

  if (ready && Number.isInteger(revision) && revision > 0 && revision !== visibleRevision) {
    visibleRevision = revision;
    liveBrowser.src = `/live?revision=${revision}`;
  } else if (!ready && visibleRevision !== 0) {
    visibleRevision = 0;
    liveBrowser.src = "about:blank";
  }
}

async function refresh() {
  try {
    const response = await fetch("/state", { cache: "no-store", credentials: "same-origin" });
    if (!response.ok) throw new Error("state unavailable");
    const state = await response.json();
    setLiveStatus(state.live_status, state.live_ready === true, state.live_revision);
  } catch {
    overallStatus.textContent = "Local viewer unavailable.";
  }
}

void refresh();
setInterval(() => void refresh(), 1000);
