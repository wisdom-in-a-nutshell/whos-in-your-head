type LogLevel = "info" | "warn" | "error";

type LogFields = Record<string, unknown>;

export function logInfo(event: string, fields: LogFields = {}) {
  writeLog("info", event, fields);
}

export function logWarn(event: string, fields: LogFields = {}) {
  writeLog("warn", event, fields);
}

export function logError(event: string, fields: LogFields = {}) {
  writeLog("error", event, fields);
}

export function describeError(error: unknown): LogFields {
  if (!(error instanceof Error)) {
    return {
      name: "UnknownError",
      message: String(error)
    };
  }

  const maybeRecord = error as Error & Record<string, unknown>;

  return compactFields({
    name: error.name,
    message: error.message,
    status: maybeRecord.status,
    code: maybeRecord.code,
    type: maybeRecord.type,
    requestId: maybeRecord.request_id ?? maybeRecord.requestId
  });
}

function writeLog(level: LogLevel, event: string, fields: LogFields) {
  const payload = JSON.stringify(
    compactFields({
      event,
      ...fields
    })
  );
  const line = `[whiyh] ${payload}`;

  if (level === "error") {
    console.error(line);
    return;
  }

  if (level === "warn") {
    console.warn(line);
    return;
  }

  console.info(line);
}

function compactFields(fields: LogFields): LogFields {
  return Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined)
  );
}
