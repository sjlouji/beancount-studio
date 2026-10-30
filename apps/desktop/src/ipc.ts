/**
 * IPC contract between the main process and the preload script.
 *
 * Types only: a sandboxed preload cannot `require` local modules, so each side declares the
 * channel literals itself and the type checker guarantees they agree.
 */

export type ConnectChannel = "server:connect";
export type SignInReopenChannel = "sign-in:reopen";
export type SignInCancelChannel = "sign-in:cancel";
/** Server pages send the person's workspaces (a DesktopWorkspaceUpdate) for the shell's menus. */
export type WorkspacesChannel = "workspaces:update";

export type ConnectResult = { ok: true } | { ok: false; error: string };
