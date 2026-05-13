#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const SCHEMA_VERSION = "1.0";
const DEFAULT_RESOURCE_GROUP = "ghost";
const DEFAULT_APP = "whos-in-your-head-adi";

const EXIT_GENERIC = 1;
const EXIT_USAGE = 2;
const EXIT_DEPENDENCY = 4;

const startedAt = Date.now();
const requestId = crypto.randomUUID();

try {
  const args = parseArgs(process.argv.slice(2));
  const command = args.command ?? "events";

  if (command !== "events") {
    throw usageError(`Unknown command: ${command}`, "Use: scripts/prod-logs.mjs events");
  }

  const events = fetchEvents(args);
  const filtered = events
    .filter((event) => (args.event ? event.event === args.event : true))
    .filter((event) =>
      args.contains
        ? JSON.stringify(event).toLowerCase().includes(args.contains.toLowerCase())
        : true
    )
    .slice(-args.limit);

  emit(args, {
    command: "prod-logs.events",
    status: "ok",
    data: {
      app: args.app,
      resourceGroup: args.resourceGroup,
      count: filtered.length,
      events: filtered
    },
    error: null
  });
} catch (error) {
  const cliError = normalizeError(error);
  emit(cliError.args ?? { output: "json" }, {
    command: "prod-logs.events",
    status: "error",
    data: null,
    error: {
      code: cliError.code,
      message: cliError.message,
      retryable: cliError.retryable,
      hint: cliError.hint
    }
  });
  process.exit(cliError.exitCode);
}

function parseArgs(argv) {
  const args = {
    command: "events",
    output: "json",
    noInput: false,
    resourceGroup: DEFAULT_RESOURCE_GROUP,
    app: DEFAULT_APP,
    limit: 50,
    contains: null,
    event: null
  };

  const rest = [...argv];
  if (rest[0] && !rest[0].startsWith("-")) {
    args.command = rest.shift();
  }

  while (rest.length > 0) {
    const arg = rest.shift();
    if (arg === "--json") {
      args.output = "json";
      continue;
    }
    if (arg === "--plain") {
      args.output = "plain";
      continue;
    }
    if (arg === "--no-input") {
      args.noInput = true;
      continue;
    }
    if (arg === "--resource-group") {
      args.resourceGroup = readValue(rest, arg);
      continue;
    }
    if (arg === "--app") {
      args.app = readValue(rest, arg);
      continue;
    }
    if (arg === "--limit") {
      args.limit = Number.parseInt(readValue(rest, arg), 10);
      if (!Number.isInteger(args.limit) || args.limit < 1) {
        throw usageError("--limit must be a positive integer");
      }
      continue;
    }
    if (arg === "--contains") {
      args.contains = readValue(rest, arg);
      continue;
    }
    if (arg === "--event") {
      args.event = readValue(rest, arg);
      continue;
    }

    throw usageError(`Unknown option: ${arg}`);
  }

  return args;
}

function readValue(rest, flag) {
  const value = rest.shift();
  if (!value) {
    throw usageError(`${flag} requires a value`);
  }
  return value;
}

function fetchEvents(args) {
  const tmpDir = join(process.cwd(), "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const zipPath = join(tmpDir, `prod-logs-${requestId}.zip`);

  try {
    console.error(`Downloading App Service logs for ${args.app}...`);
    execFileSync(
      "az",
      [
        "webapp",
        "log",
        "download",
        "--resource-group",
        args.resourceGroup,
        "--name",
        args.app,
        "--log-file",
        zipPath
      ],
      { stdio: ["ignore", "pipe", "pipe"] }
    );

    const listing = execFileSync("unzip", ["-Z1", zipPath], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    })
      .split("\n")
      .filter((line) => line.endsWith("_docker.log"));

    const events = [];
    for (const file of listing) {
      const content = execFileSync("unzip", ["-p", zipPath, file], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        maxBuffer: 20 * 1024 * 1024
      });
      for (const line of content.split("\n")) {
        const event = parseWhiyhLogLine(line);
        if (event) {
          events.push(event);
        }
      }
    }

    return events;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/az/.test(message) || /login|auth|credential/i.test(message)) {
      throw cliError("E_DEPENDENCY", message, true, "Run `az login` and retry.", EXIT_DEPENDENCY);
    }
    throw cliError("E_LOG_DOWNLOAD_FAILED", message, true, "Check Azure Web App logging and retry.");
  } finally {
    if (existsSync(zipPath)) {
      rmSync(zipPath, { force: true });
    } else {
      writeFileSync(join(tmpDir, ".keep"), "");
    }
  }
}

function parseWhiyhLogLine(line) {
  const marker = "[whiyh] ";
  const index = line.indexOf(marker);
  if (index === -1) {
    return null;
  }

  const timestampMatch = line.match(/^(\d{4}-\d{2}-\d{2}T[^\s]+)/);
  const payload = line.slice(index + marker.length);

  try {
    return {
      timestamp: timestampMatch?.[1] ?? null,
      ...JSON.parse(payload)
    };
  } catch {
    return {
      timestamp: timestampMatch?.[1] ?? null,
      event: "unparsed_log_line",
      raw: payload
    };
  }
}

function emit(args, result) {
  const envelope = {
    schema_version: SCHEMA_VERSION,
    command: result.command,
    status: result.status,
    data: result.data,
    error: result.error,
    meta: {
      request_id: requestId,
      duration_ms: Date.now() - startedAt,
      timestamp_utc: new Date().toISOString()
    }
  };

  if (args.output === "plain" && result.status === "ok") {
    for (const event of result.data.events) {
      console.log(
        `${event.timestamp ?? "-"} ${event.event ?? "-"} game=${event.gameId ?? "-"} request=${event.requestId ?? "-"}`
      );
    }
    return;
  }

  console.log(JSON.stringify(envelope, null, 2));
}

function usageError(message, hint = "Run `scripts/prod-logs.mjs events --json`.") {
  return cliError("E_USAGE", message, false, hint, EXIT_USAGE);
}

function cliError(code, message, retryable, hint, exitCode = EXIT_GENERIC) {
  const error = new Error(message);
  error.code = code;
  error.retryable = retryable;
  error.hint = hint;
  error.exitCode = exitCode;
  return error;
}

function normalizeError(error) {
  if (error && typeof error === "object" && "code" in error) {
    return error;
  }

  return cliError(
    "E_GENERIC",
    error instanceof Error ? error.message : String(error),
    false,
    "Inspect stderr and retry with a narrower query."
  );
}
