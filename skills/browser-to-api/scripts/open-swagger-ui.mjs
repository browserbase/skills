#!/usr/bin/env node
// Preview an emitted OpenAPI spec in a local Swagger UI checkout.

import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const opts = {
    run: null,
    spec: null,
    swaggerUi: null,
    host: '127.0.0.1',
    port: 0,
    open: true,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case '--run': opts.run = next(); break;
      case '--spec': opts.spec = next(); break;
      case '--swagger-ui': opts.swaggerUi = next(); break;
      case '--host': opts.host = next(); break;
      case '--port': opts.port = Number(next()); break;
      case '--no-open': opts.open = false; break;
      case '-h': case '--help':
        printHelp(); process.exit(0);
      default:
        console.error(`unknown arg: ${a}`);
        printHelp(); process.exit(2);
    }
  }
  return opts;
}

function printHelp() {
  console.error(`usage: open-swagger-ui.mjs (--run <path> | --spec <path>) [flags]

  --run <path>          browser-trace run dir; uses <run>/api-spec/openapi.yaml
  --spec <path>         OpenAPI YAML/JSON file to preview
  --swagger-ui <path>   Swagger UI checkout/package dir. Defaults to
                        $SWAGGER_UI_DIR, ~/Developer/swagger-ui, or node_modules/swagger-ui-dist
  --host <host>         Bind host. Default: 127.0.0.1
  --port <port>         Bind port. Default: random free port
  --no-open             Print the URL without opening a browser`);
}

function resolveRun(runArg) {
  if (fs.existsSync(runArg) && fs.statSync(runArg).isDirectory()) return path.resolve(runArg);
  const root = process.env.O11Y_ROOT || '.o11y';
  const guess = path.join(root, runArg);
  if (fs.existsSync(guess) && fs.statSync(guess).isDirectory()) return path.resolve(guess);
  throw new Error(`run path not found: ${runArg} (tried ${guess})`);
}

function resolveSpec(opts) {
  if (opts.spec) return path.resolve(opts.spec);
  if (!opts.run) throw new Error('expected --run <path> or --spec <path>');

  const runPath = resolveRun(opts.run);
  const candidates = [
    path.join(runPath, 'api-spec', 'openapi.yaml'),
    path.join(runPath, 'api-spec', 'openapi.json'),
  ];
  const found = candidates.find(p => fs.existsSync(p));
  if (!found) throw new Error(`no OpenAPI spec found under ${path.join(runPath, 'api-spec')}`);
  return found;
}

function swaggerUiCandidates(explicit) {
  return [
    explicit,
    process.env.SWAGGER_UI_DIR,
    path.join(os.homedir(), 'Developer', 'swagger-ui'),
    path.resolve(process.cwd(), 'node_modules', 'swagger-ui-dist'),
    path.resolve(__dirname, '..', 'node_modules', 'swagger-ui-dist'),
  ].filter(Boolean);
}

function distDirFor(candidate) {
  const resolved = path.resolve(candidate);
  const directDist = path.join(resolved, 'dist');
  if (fs.existsSync(path.join(directDist, 'index.html'))) return directDist;
  if (fs.existsSync(path.join(resolved, 'index.html')) && fs.existsSync(path.join(resolved, 'swagger-ui-bundle.js'))) return resolved;
  return null;
}

function resolveSwaggerUi(explicit) {
  for (const candidate of swaggerUiCandidates(explicit)) {
    const dist = distDirFor(candidate);
    if (dist) return dist;
  }

  const searched = swaggerUiCandidates(explicit).map(p => `  - ${path.resolve(p)}`).join('\n');
  throw new Error(`Swagger UI not found. Searched:\n${searched}\n\nInstall it locally, then rerun:\n  git clone https://github.com/swagger-api/swagger-ui.git ~/Developer/swagger-ui\n  cd ~/Developer/swagger-ui && npm ci\n\nOr pass --swagger-ui <path> / set SWAGGER_UI_DIR.`);
}

function mimeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.map': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.yaml': 'application/yaml; charset=utf-8',
    '.yml': 'application/yaml; charset=utf-8',
  }[ext] || 'application/octet-stream';
}

function swaggerInitializer(specRoute) {
  return `window.onload = function() {
  window.ui = SwaggerUIBundle({
    url: ${JSON.stringify(specRoute)},
    dom_id: '#swagger-ui',
    deepLinking: true,
    presets: [
      SwaggerUIBundle.presets.apis,
      SwaggerUIStandalonePreset
    ],
    plugins: [
      SwaggerUIBundle.plugins.DownloadUrl
    ],
    layout: 'StandaloneLayout'
  });
};
`;
}

function safeStaticPath(distDir, urlPath) {
  const decoded = decodeURIComponent(urlPath);
  const relative = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
  const fullPath = path.resolve(distDir, relative);
  const root = path.resolve(distDir);
  if (fullPath !== root && !fullPath.startsWith(root + path.sep)) return null;
  return fullPath;
}

function openUrl(url) {
  const opener = process.platform === 'darwin'
    ? ['open', [url]]
    : process.platform === 'win32'
      ? ['cmd', ['/c', 'start', '', url]]
      : ['xdg-open', [url]];
  const child = spawn(opener[0], opener[1], { detached: true, stdio: 'ignore' });
  child.unref();
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const specPath = resolveSpec(opts);
  if (!fs.existsSync(specPath)) throw new Error(`spec not found: ${specPath}`);

  const distDir = resolveSwaggerUi(opts.swaggerUi);
  const specRoute = path.extname(specPath).toLowerCase() === '.json' ? '/openapi.json' : '/openapi.yaml';

  const server = http.createServer((req, res) => {
    const requestPath = new URL(req.url, `http://${opts.host}`).pathname;
    if (requestPath === specRoute) {
      res.writeHead(200, { 'content-type': mimeFor(specPath), 'cache-control': 'no-store' });
      fs.createReadStream(specPath).pipe(res);
      return;
    }
    if (requestPath === '/swagger-initializer.js') {
      res.writeHead(200, { 'content-type': 'application/javascript; charset=utf-8', 'cache-control': 'no-store' });
      res.end(swaggerInitializer(specRoute));
      return;
    }

    const staticPath = safeStaticPath(distDir, requestPath);
    if (!staticPath || !fs.existsSync(staticPath) || fs.statSync(staticPath).isDirectory()) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('not found\n');
      return;
    }
    res.writeHead(200, { 'content-type': mimeFor(staticPath) });
    fs.createReadStream(staticPath).pipe(res);
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(opts.port, opts.host, resolve);
  });

  const address = server.address();
  const url = `http://${opts.host}:${address.port}/`;
  console.log(`swagger_ui=${distDir}`);
  console.log(`spec=${specPath}`);
  console.log(`url=${url}`);
  console.log('Press Ctrl-C to stop the preview server.');
  if (opts.open) openUrl(url);
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
