import { access, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const exampleDirectory = dirname(fileURLToPath(import.meta.url));
const packageDirectory = resolve(exampleDirectory, "../..");
const nodeModulesDirectory = resolve(packageDirectory, "node_modules");

const files = new Map([
  ["/", [resolve(exampleDirectory, "index.html"), "text/html; charset=utf-8"]],
  [
    "/index.html",
    [resolve(exampleDirectory, "index.html"), "text/html; charset=utf-8"],
  ],
  [
    "/app.js",
    [resolve(exampleDirectory, "app.js"), "text/javascript; charset=utf-8"],
  ],
  [
    "/styles.css",
    [resolve(exampleDirectory, "styles.css"), "text/css; charset=utf-8"],
  ],
  [
    "/vendor/final-form-helpers.js",
    [
      resolve(exampleDirectory, "final-form-helpers.js"),
      "text/javascript; charset=utf-8",
    ],
  ],
  [
    "/vendor/final-form-shim.js",
    [
      resolve(exampleDirectory, "final-form-shim.js"),
      "text/javascript; charset=utf-8",
    ],
  ],
  [
    "/vendor/react-shim.js",
    [
      resolve(exampleDirectory, "react-shim.js"),
      "text/javascript; charset=utf-8",
    ],
  ],
  [
    "/vendor/final-form.umd.js",
    [
      resolve(nodeModulesDirectory, "final-form/dist/final-form.umd.js"),
      "text/javascript; charset=utf-8",
    ],
  ],
  [
    "/vendor/react.development.js",
    [
      resolve(nodeModulesDirectory, "react/umd/react.development.js"),
      "text/javascript; charset=utf-8",
    ],
  ],
  [
    "/vendor/react-dom.development.js",
    [
      resolve(nodeModulesDirectory, "react-dom/umd/react-dom.development.js"),
      "text/javascript; charset=utf-8",
    ],
  ],
  [
    "/vendor/valibot.js",
    [
      resolve(nodeModulesDirectory, "valibot/dist/index.mjs"),
      "text/javascript; charset=utf-8",
    ],
  ],
  [
    "/vendor/zustand-vanilla.js",
    [
      resolve(nodeModulesDirectory, "zustand/esm/vanilla.mjs"),
      "text/javascript; charset=utf-8",
    ],
  ],
  ...[
    "definition",
    "index",
    "slice",
    "types",
    "validation",
    "valibot",
  ].map(
    (moduleName) => [
      `/library/${moduleName}.js`,
      [
        resolve(packageDirectory, `dist/${moduleName}.js`),
        "text/javascript; charset=utf-8",
      ],
    ],
  ),
]);

const requiredFiles = [...new Set([...files.values()].map(([path]) => path))];

try {
  await Promise.all(requiredFiles.map((path) => access(path)));
} catch (error) {
  const missing = [];
  for (const path of requiredFiles) {
    try {
      await access(path);
    } catch {
      missing.push(path);
    }
  }

  console.error("The grocery example cannot start because files are missing:");
  for (const path of missing) console.error(`  - ${path}`);
  console.error("Run `pnpm install` and `pnpm run build`, then try again.");
  process.exitCode = 1;
  throw error;
}

if (process.argv.includes("--check")) {
  console.log(`Verified ${requiredFiles.length} grocery example files.`);
  process.exit(0);
}

const configuredPort = process.env.ZUSTIK_FORM_EXAMPLE_PORT ?? "4173";
const port = Number(configuredPort);
if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new TypeError(
    `ZUSTIK_FORM_EXAMPLE_PORT must be an integer from 1 to 65535; received ${JSON.stringify(configuredPort)}.`,
  );
}

const host = "127.0.0.1";
const server = createServer(async (request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, {
      Allow: "GET, HEAD",
      "Content-Type": "text/plain; charset=utf-8",
    });
    response.end("Method not allowed\n");
    return;
  }

  let pathname;
  try {
    pathname = new URL(request.url ?? "/", `http://${host}:${port}`).pathname;
  } catch {
    response.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Bad request\n");
    return;
  }

  const route = files.get(pathname);
  if (route === undefined) {
    response.writeHead(404, {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    });
    response.end("Not found\n");
    return;
  }

  try {
    const [filePath, contentType] = route;
    const body = await readFile(filePath);
    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Length": String(body.byteLength),
      "Content-Security-Policy":
        "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
      "Content-Type": contentType,
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
    });
    response.end(request.method === "HEAD" ? undefined : body);
  } catch (error) {
    console.error(`Failed to serve ${pathname}:`, error);
    response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Internal server error\n");
  }
});

server.on("error", (error) => {
  console.error("Could not start the grocery example:", error);
  process.exitCode = 1;
});

server.listen(port, host, () => {
  console.log(`Zustik Form grocery sandbox: http://${host}:${port}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    server.close(() => process.exit(0));
  });
}
