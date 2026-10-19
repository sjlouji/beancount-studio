/**
 * IPC contract between the main process and the preload script.
 *
 * Types only: a sandboxed preload cannot `require` local modules, so each side declares the
 * channel literal itself and the type checker guarantees they agree.
 */

export type ConnectChannel = "server:connect";

export type ConnectResult = { ok: true } | { ok: false; error: string };
