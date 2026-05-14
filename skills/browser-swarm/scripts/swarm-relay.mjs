#!/usr/bin/env node
import http from "node:http";
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { WebSocketServer } from "ws";

const DEFAULT_PORT = 19989;
const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_GROUP_TITLE = "browser-swarm";
const DEFAULT_GROUP_COLOR = "cyan";

function parseArgs(argv) {
  const [command = "help", ...rest] = argv;
  const opts = { command, labels: [], urls: [], json: false };
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === "--port") opts.port = Number(rest[++i]);
    else if (arg === "--host") opts.host = rest[++i];
    else if (arg === "--count") opts.count = Number(rest[++i]);
    else if (arg === "--label") opts.labels.push(rest[++i]);
    else if (arg === "--url") opts.urls.push(rest[++i]);
    else if (arg === "--target-id") opts.targetId = rest[++i];
    else if (arg === "--group-title") opts.groupTitle = rest[++i];
    else if (arg === "--group-color") opts.groupColor = rest[++i];
    else if (arg === "--no-group") opts.noGroup = true;
    else if (arg === "--json") opts.json = true;
    else if (arg === "--compact") opts.compact = true;
    else if (arg === "--path") opts.path = rest[++i];
    else if (arg === "--expr") opts.expr = rest[++i];
    else if (arg === "--help" || arg === "-h") opts.help = true;
    else if (!opts._) opts._ = [arg];
    else opts._.push(arg);
  }
  return opts;
}

function usage() {
  console.log(`Usage:
  node scripts/swarm-relay.mjs serve [--host 127.0.0.1] [--port 19989]
  node scripts/swarm-relay.mjs ensure --count <n> [--label <name>]... [--url <url>]... [--no-group] [--json]
  node scripts/swarm-relay.mjs tabs [--json]
  node scripts/swarm-relay.mjs browse-url --target-id <id>
  node scripts/swarm-relay.mjs navigate --target-id <id> <url>
  node scripts/swarm-relay.mjs eval --target-id <id> --expr <js>
  node scripts/swarm-relay.mjs screenshot --target-id <id> --path <file>
`);
}

function json(res, status, value) {
  const body = JSON.stringify(value, null, 2);
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(body)
  });
  res.end(body);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function print(value, asJson = false) {
  if (asJson || typeof value !== "string") {
    console.log(JSON.stringify(value, null, 2));
  } else {
    console.log(value);
  }
}

async function post(path, body, port = DEFAULT_PORT, host = DEFAULT_HOST) {
  const response = await fetch(`http://${host}:${port}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body || {})
  });
  const text = await response.text();
  const parsed = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(parsed.error || `HTTP ${response.status}`);
  }
  return parsed;
}

async function get(path, port = DEFAULT_PORT, host = DEFAULT_HOST) {
  const response = await fetch(`http://${host}:${port}${path}`);
  const text = await response.text();
  const parsed = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(parsed.error || `HTTP ${response.status}`);
  }
  return parsed;
}

class Relay {
  constructor({ host, port }) {
    this.host = host;
    this.port = port;
    this.extension = null;
    this.extensionInfo = null;
    this.extensionRequests = new Map();
    this.targets = new Map();
    this.clients = new Set();
    this.groupDisabled = false;
    this.server = http.createServer((req, res) => this.handleHttp(req, res));
    this.wss = new WebSocketServer({ noServer: true });
    this.server.on("upgrade", (req, socket, head) => this.handleUpgrade(req, socket, head));
  }

  listen() {
    return new Promise((resolve) => {
      this.server.listen(this.port, this.host, resolve);
    });
  }

  async handleHttp(req, res) {
    try {
      const url = new URL(req.url, `http://${this.host}:${this.port}`);
      if (req.method === "GET" && url.pathname === "/health") {
        json(res, 200, {
          ok: true,
          extensionConnected: Boolean(this.extension),
          extension: this.extensionInfo,
          targetCount: this.targets.size
        });
        return;
      }

      if (req.method === "GET" && (url.pathname === "/json/version" || url.pathname === "/json/version/")) {
        json(res, 200, {
          Browser: "BrowserSwarm/0.1.0",
          "Protocol-Version": "1.3",
          webSocketDebuggerUrl: this.browserWsUrl()
        });
        return;
      }

      if (req.method === "GET" && ["/json/list", "/json/list/", "/json", "/json/"].includes(url.pathname)) {
        json(res, 200, this.targetList());
        return;
      }

      if (req.method === "GET" && url.pathname === "/swarm/tabs") {
        await this.refreshTargets();
        json(res, 200, { targets: this.enrichedTargets() });
        return;
      }

      if (req.method === "POST" && url.pathname === "/swarm/ensure") {
        const body = await readBody(req);
        const result = await this.ensureTabs(body);
        json(res, 200, result);
        return;
      }

      if (req.method === "POST" && url.pathname === "/swarm/navigate") {
        const body = await readBody(req);
        const result = await this.forwardToTarget(body.targetId, "Page.navigate", { url: body.url });
        json(res, 200, result);
        return;
      }

      if (req.method === "POST" && url.pathname === "/swarm/eval") {
        const body = await readBody(req);
        const result = await this.forwardToTarget(body.targetId, "Runtime.evaluate", {
          expression: body.expr,
          awaitPromise: true,
          returnByValue: true
        });
        json(res, 200, result);
        return;
      }

      if (req.method === "POST" && url.pathname === "/swarm/screenshot") {
        const body = await readBody(req);
        const result = await this.forwardToTarget(body.targetId, "Page.captureScreenshot", {
          format: "png",
          captureBeyondViewport: true
        });
        json(res, 200, result);
        return;
      }

      json(res, 404, { error: `No route for ${req.method} ${url.pathname}` });
    } catch (error) {
      json(res, 500, { error: error instanceof Error ? error.message : String(error) });
    }
  }

  handleUpgrade(req, socket, head) {
    const url = new URL(req.url, `http://${this.host}:${this.port}`);
    this.wss.handleUpgrade(req, socket, head, (ws) => {
      if (url.pathname === "/extension") {
        this.attachExtension(ws);
      } else if (url.pathname.startsWith("/devtools/browser")) {
        const parts = url.pathname.split("/").filter(Boolean);
        const targetId = parts.length > 2 ? decodeURIComponent(parts[2]) : null;
        this.attachCdpClient(ws, targetId);
      } else {
        ws.close(1008, "Unknown browser-swarm endpoint");
      }
    });
  }

  browserWsUrl(targetId = null) {
    const suffix = targetId ? `/${encodeURIComponent(targetId)}` : "";
    return `ws://${this.host}:${this.port}/devtools/browser${suffix}`;
  }

  targetList(targetId = null) {
    return this.enrichedTargets()
      .filter((target) => !targetId || target.targetId === targetId)
      .map((target) => ({
        id: target.targetId,
        type: target.targetInfo.type,
        title: target.targetInfo.title,
        description: target.label || target.targetInfo.title,
        url: target.targetInfo.url,
        webSocketDebuggerUrl: this.browserWsUrl(target.targetId),
        devtoolsFrontendUrl: `/devtools/inspector.html?ws=${this.host}:${this.port}/devtools/browser/${target.targetId}`
      }));
  }

  enrichedTargets(targetId = null) {
    return Array.from(this.targets.values())
      .filter((target) => !targetId || target.targetId === targetId)
      .map((target) => ({
        ...target,
        wsUrl: this.browserWsUrl(target.targetId)
      }));
  }

  attachExtension(ws) {
    if (this.extension && this.extension.readyState === this.extension.OPEN) {
      this.extension.close(4001, "Replaced by new extension connection");
    }
    this.extension = ws;
    this.extensionInfo = null;

    ws.on("message", (raw) => this.handleExtensionMessage(raw));
    ws.on("close", () => {
      if (this.extension === ws) {
        this.extension = null;
        this.extensionInfo = null;
        this.targets.clear();
      }
    });
    ws.on("error", () => {});
  }

  handleExtensionMessage(raw) {
    let message;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (message.type === "hello") {
      this.extensionInfo = {
        name: message.extension || "unknown",
        version: message.version || "unknown",
        connectedAt: new Date().toISOString()
      };
      this.targets.clear();
      this.mergeTargets(message.targets || []);
      return;
    }

    if (message.type === "response") {
      const pending = this.extensionRequests.get(message.id);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.extensionRequests.delete(message.id);
      if (message.error) pending.reject(new Error(message.error));
      else pending.resolve(message.result);
      return;
    }

    if (message.type === "cdpEvent") {
      this.forwardEvent(message);
      return;
    }

    if (message.type === "warning") {
      console.warn(JSON.stringify({ source: "browser-swarm-extension", ...message }));
      return;
    }

    if (message.type === "targetDetached") {
      const hadTarget = this.targets.delete(message.targetId);
      if (!hadTarget) return;
      this.broadcast({
        method: "Target.detachedFromTarget",
        params: {
          sessionId: message.sessionId,
          targetId: message.targetId
        }
      }, message.targetId);
    }
  }

  sendToExtension(method, params = {}) {
    if (!this.extension || this.extension.readyState !== this.extension.OPEN) {
      throw new Error("Browser Swarm extension is not connected");
    }

    const id = randomUUID();
    const payload = { type: "request", id, method, params };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.extensionRequests.delete(id);
        reject(new Error(`Extension request timed out: ${method}`));
      }, 30000);
      this.extensionRequests.set(id, { resolve, reject, timer });
      this.extension.send(JSON.stringify(payload));
    });
  }

  mergeTargets(targets) {
    for (const target of targets) {
      if (!target?.targetId || !target?.targetInfo) continue;
      this.targets.set(target.targetId, {
        ...target,
        targetInfo: {
          ...target.targetInfo,
          attached: true
        }
      });
    }
  }

  async refreshTargets() {
    if (!this.extension || this.extension.readyState !== this.extension.OPEN) return;
    const result = await this.sendToExtension("listTargets");
    this.targets.clear();
    this.mergeTargets(result.targets || []);
  }

  async ensureTabs(body) {
    const groupDisabled = Boolean(body.groupDisabled || body.noGroup);
    this.groupDisabled = groupDisabled;
    const result = await this.sendToExtension("ensureTabs", {
      count: body.count || 1,
      labels: body.labels || [],
      urls: body.urls || [],
      groupDisabled,
      groupTitle: groupDisabled ? null : body.groupTitle || DEFAULT_GROUP_TITLE,
      groupColor: body.groupColor || DEFAULT_GROUP_COLOR
    });
    this.mergeTargets(result.targets || []);
    return {
      ...result,
      targets: this.enrichedTargets()
    };
  }

  attachCdpClient(ws, targetId) {
    const client = {
      id: randomUUID(),
      ws,
      targetId,
      autoAttach: false
    };
    this.clients.add(client);

    ws.on("message", (raw) => this.handleCdpMessage(client, raw));
    ws.on("close", () => this.clients.delete(client));
    ws.on("error", () => {});
  }

  async handleCdpMessage(client, raw) {
    let message;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      return;
    }

    const { id, method, params = {}, sessionId } = message;
    try {
      const result = await this.handleCdpCommand(client, method, params, sessionId);
      if (id !== undefined) {
        this.sendCdp(client, { id, sessionId, result: result || {} });
      }
      try {
        this.emitSyntheticEvents(client, method, params, sessionId, result);
      } catch (error) {
        console.warn(JSON.stringify({
          source: "browser-swarm-relay",
          type: "synthetic-event-warning",
          method,
          message: error instanceof Error ? error.message : String(error)
        }));
      }
    } catch (error) {
      if (id !== undefined) {
        this.sendCdp(client, {
          id,
          sessionId,
          error: {
            message: error instanceof Error ? error.message : String(error)
          }
        });
      }
    }
  }

  async handleCdpCommand(client, method, params, sessionId) {
    const targets = this.targetsForClient(client);
    const firstTarget = targets[0];

    if (client.targetId && method === "Target.createTarget") {
      throw new Error("Target.createTarget is disabled on browser-swarm worker endpoints; allocate tabs through the browser-swarm harness.");
    }

    if (client.targetId && method === "Target.closeTarget") {
      throw new Error("Target.closeTarget is disabled on browser-swarm worker endpoints; release tabs through the browser-swarm harness.");
    }

    const sessionTarget = sessionId ? this.findTargetBySession(sessionId, client) : null;

    switch (method) {
      case "Target.getTargets":
        return {
          targetInfos: targets.map((target) => ({
            ...target.targetInfo,
            attached: true
          }))
        };
      case "Target.getTargetInfo": {
        const target = params.targetId
          ? this.findTarget(params.targetId, client)
          : sessionTarget || this.findTarget(null, client);
        return { targetInfo: { ...target.targetInfo, attached: true } };
      }
      case "Target.attachToTarget": {
        const target = params.targetId
          ? this.findTarget(params.targetId, client)
          : sessionTarget || this.findTarget(null, client);
        return { sessionId: target.sessionId };
      }
    }

    if (!sessionId) {
      switch (method) {
        case "Browser.getVersion":
          return {
            protocolVersion: "1.3",
            product: "Chrome/BrowserSwarm",
            revision: "browser-swarm",
            userAgent: "BrowserSwarm/0.1.0",
            jsVersion: "V8"
          };
        case "Browser.setDownloadBehavior":
          return {};
        case "Target.setDiscoverTargets":
          return {};
        case "Target.setAutoAttach":
          client.autoAttach = Boolean(params.autoAttach);
          await this.sendToExtension("forwardCDPCommand", {
            method,
            params,
            targetId: firstTarget?.targetId
          }).catch(() => {});
          return {};
        case "Target.createTarget": {
          const result = await this.sendToExtension("createTarget", {
            url: params.url || "about:blank",
            groupDisabled: this.groupDisabled,
            groupTitle: this.groupDisabled ? null : DEFAULT_GROUP_TITLE,
            groupColor: DEFAULT_GROUP_COLOR
          });
          this.mergeTargets([result.target]);
          return { targetId: result.targetId };
        }
        case "Target.closeTarget": {
          const target = this.findTarget(params.targetId, client);
          const result = await this.sendToExtension("closeTarget", { targetId: target.targetId });
          if (result?.success !== false) {
            const hadTarget = this.targets.delete(target.targetId);
            if (hadTarget) {
              this.broadcast({
                method: "Target.detachedFromTarget",
                params: {
                  sessionId: target.sessionId,
                  targetId: target.targetId
                }
              }, target.targetId);
            }
          }
          return result;
        }
      }
    }

    const target = sessionTarget || this.findTargetBySession(sessionId, client);
    return this.sendToExtension("forwardCDPCommand", {
      targetId: target.targetId,
      tabId: target.tabId,
      sessionId,
      method,
      params
    });
  }

  emitSyntheticEvents(client, method, params, sessionId, result) {
    if (method === "Target.setAutoAttach" && !sessionId && params?.autoAttach) {
      for (const target of this.targetsForClient(client)) {
        this.sendCdp(client, {
          method: "Target.attachedToTarget",
          params: {
            sessionId: target.sessionId,
            targetInfo: { ...target.targetInfo, attached: true },
            waitingForDebugger: false
          }
        });
      }
    }

    if (method === "Target.setDiscoverTargets" && params?.discover) {
      for (const target of this.targetsForClient(client)) {
        this.sendCdp(client, {
          method: "Target.targetCreated",
          params: {
            targetInfo: { ...target.targetInfo, attached: true }
          }
        });
      }
    }

    if (method === "Target.attachToTarget" && result?.sessionId) {
      const target = this.findTarget(params.targetId, client);
      this.sendCdp(client, {
        method: "Target.attachedToTarget",
        params: {
          sessionId: result.sessionId,
          targetInfo: { ...target.targetInfo, attached: true },
          waitingForDebugger: false
        }
      });
    }
  }

  targetsForClient(client) {
    const all = Array.from(this.targets.values());
    if (!client.targetId) return all;
    return all.filter((target) => target.targetId === client.targetId);
  }

  findTarget(targetId, client) {
    const targets = this.targetsForClient(client);
    const target = targetId
      ? targets.find((candidate) => candidate.targetId === targetId)
      : targets[0];
    if (!target) {
      throw new Error(`No target available${targetId ? ` for ${targetId}` : ""}`);
    }
    return target;
  }

  findTargetBySession(sessionId, client) {
    const targets = this.targetsForClient(client);
    if (!sessionId) return this.findTarget(null, client);
    const target = targets.find((candidate) => candidate.sessionId === sessionId);
    if (target) return target;
    throw new Error(`No target available for session ${sessionId}`);
  }

  async forwardToTarget(targetId, method, params) {
    const target = this.findTarget(targetId, { targetId });
    return this.sendToExtension("forwardCDPCommand", {
      targetId: target.targetId,
      tabId: target.tabId,
      sessionId: target.sessionId,
      method,
      params
    });
  }

  forwardEvent(event) {
    if (event.method === "Target.targetInfoChanged" && event.params?.targetInfo?.targetId) {
      const existing = this.targets.get(event.params.targetInfo.targetId);
      if (existing) {
        this.targets.set(existing.targetId, {
          ...existing,
          targetInfo: {
            ...existing.targetInfo,
            ...event.params.targetInfo,
            attached: true
          }
        });
      }
    }

    this.broadcast({
      method: event.method,
      sessionId: event.sessionId,
      params: event.params
    }, event.targetId);
  }

  broadcast(message, targetId = null) {
    for (const client of this.clients) {
      if (client.ws.readyState !== client.ws.OPEN) continue;
      if (client.targetId && targetId && client.targetId !== targetId) continue;
      this.sendCdp(client, message);
    }
  }

  sendCdp(client, message) {
    if (client.ws.readyState === client.ws.OPEN) {
      client.ws.send(JSON.stringify(message));
    }
  }
}

async function runCli(opts) {
  const port = opts.port || DEFAULT_PORT;
  const host = opts.host || DEFAULT_HOST;
  if (opts.help || opts.command === "help") {
    usage();
    return;
  }

  if (opts.command === "serve") {
    const relay = new Relay({ host, port });
    await relay.listen();
    console.log(JSON.stringify({
      listening: true,
      host,
      port,
      extensionEndpoint: `ws://${host}:${port}/extension`,
      browserEndpoint: `ws://${host}:${port}/devtools/browser`
    }, null, 2));
    return;
  }

  if (opts.command === "ensure") {
    const groupDisabled = Boolean(opts.noGroup);
    const result = await post("/swarm/ensure", {
      count: opts.count || Math.max(opts.labels.length, opts.urls.length, 1),
      labels: opts.labels,
      urls: opts.urls,
      groupDisabled,
      groupTitle: groupDisabled ? null : opts.groupTitle || DEFAULT_GROUP_TITLE,
      groupColor: opts.groupColor || DEFAULT_GROUP_COLOR
    }, port, host);
    print(result, opts.json);
    return;
  }

  if (opts.command === "tabs") {
    const result = await get("/swarm/tabs", port, host);
    print(result, opts.json);
    return;
  }

  if (opts.command === "browse-url") {
    if (!opts.targetId) throw new Error("--target-id is required");
    print(`ws://${host}:${port}/devtools/browser/${encodeURIComponent(opts.targetId)}`, false);
    return;
  }

  if (opts.command === "navigate") {
    if (!opts.targetId || !opts._?.[0]) throw new Error("navigate requires --target-id and URL");
    const result = await post("/swarm/navigate", { targetId: opts.targetId, url: opts._[0] }, port, host);
    print(result, opts.json);
    return;
  }

  if (opts.command === "eval") {
    if (!opts.targetId || !opts.expr) throw new Error("eval requires --target-id and --expr");
    const result = await post("/swarm/eval", { targetId: opts.targetId, expr: opts.expr }, port, host);
    print(result, opts.json);
    return;
  }

  if (opts.command === "screenshot") {
    if (!opts.targetId) throw new Error("screenshot requires --target-id");
    const result = await post("/swarm/screenshot", { targetId: opts.targetId }, port, host);
    if (opts.path) {
      if (!result?.data) throw new Error("Screenshot response did not include image data");
      const bytes = Buffer.from(result.data, "base64");
      writeFileSync(opts.path, bytes);
      print(opts.json ? { path: opts.path, bytes: bytes.length } : opts.path, opts.json);
      return;
    }
    print(result, opts.json);
    return;
  }

  throw new Error(`Unknown command: ${opts.command}`);
}

runCli(parseArgs(process.argv.slice(2))).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
