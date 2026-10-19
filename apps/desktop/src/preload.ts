import { contextBridge, ipcRenderer } from "electron";

import type { StudioDesktopBridge } from "@beancount-studio/desktop-bridge";

import type { ConnectChannel, ConnectResult, SignInCancelChannel, SignInReopenChannel } from "./ipc";

// This file runs sandboxed: only `electron` and a few Node built-ins can be required, so it
// must not import local modules at runtime. Main passes the version as an argument because
// package.json is out of reach too.
const CONNECT_CHANNEL: ConnectChannel = "server:connect";
const SIGN_IN_REOPEN_CHANNEL: SignInReopenChannel = "sign-in:reopen";
const SIGN_IN_CANCEL_CHANNEL: SignInCancelChannel = "sign-in:cancel";

const VERSION_ARG = "--studio-version=";
const versionArg = process.argv.find((arg) => arg.startsWith(VERSION_ARG));
if (!versionArg) {
  console.error("studio preload: main did not pass --studio-version");
}

const bridge: StudioDesktopBridge = {
  version: versionArg ? versionArg.slice(VERSION_ARG.length) : "unknown",
  platform: process.platform as StudioDesktopBridge["platform"],
};
contextBridge.exposeInMainWorld("studioDesktop", bridge);

// Only the shell's own connect screen (a file: URL) may drive server selection and sign-in.
// Main re-checks the sender frame, so this gate is a convenience, not the security boundary.
if (window.location.protocol === "file:") {
  contextBridge.exposeInMainWorld("studioDesktopConnect", {
    connect: (url: string): Promise<ConnectResult> => ipcRenderer.invoke(CONNECT_CHANNEL, url),
    reopenSignIn: (): Promise<ConnectResult> => ipcRenderer.invoke(SIGN_IN_REOPEN_CHANNEL),
    cancelSignIn: (): Promise<void> => ipcRenderer.invoke(SIGN_IN_CANCEL_CHANNEL),
  });
}
