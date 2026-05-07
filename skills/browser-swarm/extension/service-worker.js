const DEFAULT_PORT = 19989;
const GROUP_TITLE = "browser-swarm";
const GROUP_COLOR = "cyan";
const RECONNECT_MS = 2000;

let ws = null;
let connectTimer = null;
let autoAttachParams = null;
let nextSyntheticSession = 1;
const targetsByTab = new Map();
const childSessions = new Map();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function send(message) {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

function scheduleConnect() {
  if (connectTimer) return;
  connectTimer = setTimeout(() => {
    connectTimer = null;
    connect();
  }, RECONNECT_MS);
}

async function connect() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;

  const { port = DEFAULT_PORT } = await chrome.storage.local.get({ port: DEFAULT_PORT });
  const socket = new WebSocket(`ws://127.0.0.1:${port}/extension`);
  ws = socket;

  socket.onopen = async () => {
    send({
      type: "hello",
      extension: "browser-swarm",
      version: chrome.runtime.getManifest().version,
      targets: await listAttachedTargets()
    });
  };

  socket.onmessage = async (event) => {
    let message;
    try {
      message = JSON.parse(event.data);
    } catch (error) {
      return;
    }

    if (message.type !== "request") return;

    try {
      const result = await handleRequest(message);
      send({ type: "response", id: message.id, result });
    } catch (error) {
      send({
        type: "response",
        id: message.id,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  };

  socket.onclose = () => {
    if (ws === socket) ws = null;
    scheduleConnect();
  };

  socket.onerror = () => {
    try {
      socket.close();
    } catch {}
  };
}

async function handleRequest(message) {
  const { method, params = {} } = message;

  switch (method) {
    case "ensureTabs":
      return ensureTabs(params);
    case "listTargets":
      return { targets: await listAttachedTargets() };
    case "forwardCDPCommand":
      return forwardCDPCommand(params);
    case "createTarget":
      return createTarget(params);
    case "closeTarget":
      return closeTarget(params);
    default:
      throw new Error(`Unknown extension method: ${method}`);
  }
}

async function ensureTabs(params) {
  const count = Number(params.count || 1);
  const labels = Array.isArray(params.labels) ? params.labels : [];
  const urls = Array.isArray(params.urls) ? params.urls : [];
  const title = typeof params.groupTitle === "string" ? params.groupTitle : GROUP_TITLE;
  const color = typeof params.groupColor === "string" ? params.groupColor : GROUP_COLOR;

  let groupId = await findGroup(title);
  const groupTabs = groupId === null ? [] : await chrome.tabs.query({ groupId });
  const tabs = [...groupTabs];

  while (tabs.length < count) {
    const index = tabs.length;
    const url = urls[index] || "about:blank";
    const tab = await chrome.tabs.create({ url, active: index === 0 });
    tabs.push(tab);
  }

  const tabIds = tabs.map((tab) => tab.id).filter((id) => typeof id === "number");
  if (tabIds.length > 0) {
    if (groupId === null) {
      groupId = await chrome.tabs.group({ tabIds });
      await chrome.tabGroups.update(groupId, { title, color, collapsed: false });
    } else {
      await chrome.tabs.group({ tabIds, groupId });
      await chrome.tabGroups.update(groupId, { title, color, collapsed: false });
    }
  }

  const attached = [];
  for (let i = 0; i < Math.min(count, tabs.length); i++) {
    const tab = tabs[i];
    if (!tab.id) continue;
    if (urls[i] && tab.url !== urls[i] && !tab.url?.startsWith(urls[i])) {
      await chrome.tabs.update(tab.id, { url: urls[i], active: i === 0 });
      await waitForTabLoad(tab.id, 15000).catch(() => {});
    }
    const target = await attachTab(tab.id, labels[i] || `tab-${i + 1}`);
    attached.push(target);
  }

  await syncGroupForAttached(title, color);
  return { groupId, targets: attached };
}

async function findGroup(title) {
  const groups = await chrome.tabGroups.query({ title });
  return groups.length > 0 ? groups[0].id : null;
}

async function syncGroupForAttached(title, color) {
  const tabIds = Array.from(targetsByTab.keys());
  if (tabIds.length === 0) return;

  let groupId = await findGroup(title);
  if (groupId === null) {
    groupId = await chrome.tabs.group({ tabIds });
  } else {
    await chrome.tabs.group({ tabIds, groupId });
  }
  await chrome.tabGroups.update(groupId, { title, color, collapsed: false });
}

async function waitForTabLoad(tabId, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const tab = await chrome.tabs.get(tabId);
    if (tab.status === "complete") return;
    await sleep(100);
  }
}

async function createTarget(params) {
  const tab = await chrome.tabs.create({
    url: params.url || "about:blank",
    active: false
  });
  if (!tab.id) throw new Error("Chrome did not return a tab id");
  await waitForTabLoad(tab.id, 15000).catch(() => {});
  const target = await attachTab(tab.id, params.label || "created");
  await syncGroupForAttached(params.groupTitle || GROUP_TITLE, params.groupColor || GROUP_COLOR);
  return { targetId: target.targetId, target };
}

async function closeTarget(params) {
  const target = findTarget(params);
  if (!target) return { success: false };
  await chrome.tabs.remove(target.tabId);
  targetsByTab.delete(target.tabId);
  return { success: true };
}

function findTarget(params) {
  if (params.tabId && targetsByTab.has(params.tabId)) return targetsByTab.get(params.tabId);
  if (params.targetId) {
    for (const target of targetsByTab.values()) {
      if (target.targetId === params.targetId) return target;
    }
  }
  if (params.sessionId) {
    for (const target of targetsByTab.values()) {
      if (target.sessionId === params.sessionId) return target;
    }
    const child = childSessions.get(params.sessionId);
    if (child) return targetsByTab.get(child.tabId);
  }
  return null;
}

async function attachTab(tabId, label) {
  const existing = targetsByTab.get(tabId);
  if (existing?.state === "connected") {
    return existing;
  }

  const debuggee = { tabId };
  try {
    await chrome.debugger.attach(debuggee, "1.3");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("Another debugger is already attached")) {
      throw error;
    }
  }

  await chrome.debugger.sendCommand(debuggee, "Page.enable").catch(() => {});
  await chrome.debugger.sendCommand(debuggee, "Runtime.enable").catch(() => {});

  if (autoAttachParams) {
    await chrome.debugger.sendCommand(debuggee, "Target.setAutoAttach", autoAttachParams).catch(() => {});
  }

  const info = await chrome.debugger.sendCommand(debuggee, "Target.getTargetInfo");
  const targetInfo = normalizeTargetInfo(info.targetInfo, tabId);
  const sessionId = existing?.sessionId || `swarm-tab-${Date.now().toString(36)}-${nextSyntheticSession++}`;
  const target = {
    tabId,
    label,
    sessionId,
    targetId: targetInfo.targetId,
    targetInfo,
    state: "connected"
  };
  targetsByTab.set(tabId, target);
  return target;
}

function normalizeTargetInfo(info, tabId) {
  return {
    targetId: info?.targetId || `tab-${tabId}`,
    type: info?.type || "page",
    title: info?.title || "",
    url: info?.url || "about:blank",
    attached: true,
    canAccessOpener: false,
    browserContextId: info?.browserContextId
  };
}

async function listAttachedTargets() {
  const targets = [];
  for (const [tabId, target] of targetsByTab.entries()) {
    try {
      const info = await chrome.debugger.sendCommand({ tabId }, "Target.getTargetInfo");
      const targetInfo = normalizeTargetInfo(info.targetInfo, tabId);
      const updated = { ...target, targetId: targetInfo.targetId, targetInfo };
      targetsByTab.set(tabId, updated);
      targets.push(updated);
    } catch {
      targetsByTab.delete(tabId);
    }
  }
  return targets;
}

async function forwardCDPCommand(params) {
  const target = findTarget(params);
  if (!target) {
    throw new Error(`No browser-swarm tab for ${JSON.stringify({
      targetId: params.targetId,
      sessionId: params.sessionId,
      tabId: params.tabId
    })}`);
  }

  if (params.method === "Target.setAutoAttach" && !params.sessionId) {
    autoAttachParams = params.params || {};
    await Promise.all(Array.from(targetsByTab.keys()).map((tabId) =>
      chrome.debugger.sendCommand({ tabId }, "Target.setAutoAttach", autoAttachParams).catch(() => {})
    ));
    return {};
  }

  const debuggee = { tabId: target.tabId };
  const childSession = params.sessionId && params.sessionId !== target.sessionId
    ? params.sessionId
    : undefined;
  const debuggerSession = childSession ? { ...debuggee, sessionId: childSession } : debuggee;

  if (params.method === "Runtime.enable") {
    await chrome.debugger.sendCommand(debuggerSession, "Runtime.disable").catch(() => {});
  }

  return chrome.debugger.sendCommand(debuggerSession, params.method, params.params || {});
}

chrome.debugger.onEvent.addListener((source, method, params) => {
  const tabId = source.tabId;
  if (!tabId || !targetsByTab.has(tabId)) return;

  const target = targetsByTab.get(tabId);
  if (method === "Target.attachedToTarget" && params?.sessionId) {
    childSessions.set(params.sessionId, {
      tabId,
      targetId: params.targetInfo?.targetId
    });
  }
  if (method === "Target.detachedFromTarget" && params?.sessionId) {
    childSessions.delete(params.sessionId);
  }

  send({
    type: "cdpEvent",
    tabId,
    targetId: target.targetId,
    sessionId: source.sessionId || target.sessionId,
    method,
    params
  });
});

chrome.debugger.onDetach.addListener((source) => {
  if (!source.tabId) return;
  const target = targetsByTab.get(source.tabId);
  targetsByTab.delete(source.tabId);
  if (target) {
    send({
      type: "targetDetached",
      tabId: source.tabId,
      targetId: target.targetId,
      sessionId: target.sessionId
    });
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  const target = targetsByTab.get(tabId);
  targetsByTab.delete(tabId);
  if (target) {
    send({
      type: "targetDetached",
      tabId,
      targetId: target.targetId,
      sessionId: target.sessionId
    });
  }
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "browser-swarm-heartbeat") {
    connect();
    send({ type: "ping" });
  }
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create("browser-swarm-heartbeat", { periodInMinutes: 0.1 });
  connect();
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create("browser-swarm-heartbeat", { periodInMinutes: 0.1 });
  connect();
});

chrome.action.onClicked.addListener(() => {
  connect();
});

chrome.alarms.create("browser-swarm-heartbeat", { periodInMinutes: 0.1 });
connect();

