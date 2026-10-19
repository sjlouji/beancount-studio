import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { app } from "electron";
import log from "electron-log/main";

export interface Settings {
  serverUrl?: string;
}

const FILE_NAME = "settings.json";

function settingsPath(): string {
  return join(app.getPath("userData"), FILE_NAME);
}

/**
 * Reads the saved settings. A missing file is the first launch. An unreadable or malformed file
 * is logged and reported through `problem` so the connect screen can show it.
 */
export function readSettings(): { settings: Settings; problem?: string } {
  const path = settingsPath();
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      log.debug("settings: no file yet, first launch", path);
      return { settings: {} };
    }
    log.error("settings: cannot read", path, error);
    return { settings: {}, problem: `The settings file could not be read (${path}). Connect again.` };
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) {
      throw new TypeError("settings root is not an object");
    }
    const serverUrl = (parsed as Record<string, unknown>).serverUrl;
    if (serverUrl !== undefined && typeof serverUrl !== "string") {
      throw new TypeError("serverUrl is not a string");
    }
    return { settings: { serverUrl } };
  } catch (error) {
    log.error("settings: malformed file", path, error);
    return { settings: {}, problem: `The settings file is malformed (${path}). Connect again.` };
  }
}

export function writeSettings(settings: Settings): void {
  mkdirSync(app.getPath("userData"), { recursive: true });
  writeFileSync(settingsPath(), `${JSON.stringify(settings, null, 2)}\n`, "utf8");
}
