import { parseState } from "./workspace";
import type { WorkspaceState } from "./workspaceTypes";

export const WORKSPACE_KEY = "groundwork.workspace.v1";

export type WorkspaceStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export type WorkspaceStorageWarning = "storage_unavailable" | "quota_exceeded" | "corrupt"
  | "invalid" | "unsupported_version" | "pruned";
export type WorkspaceLoad = { state: WorkspaceState | null; warning: WorkspaceStorageWarning | null };
export type WorkspaceWrite = { ok: true } | { ok: false; warning: WorkspaceStorageWarning };

/** A project can leave the proposed pool without losing its saved diligence. */
export function pruneWorkspaceState(state: WorkspaceState, allowedIds: readonly string[]): { state: WorkspaceState; pruned: boolean } {
  const allowed = new Set(allowedIds);
  const selectedIds = state.selectedIds.filter((id) => allowed.has(id));
  const pruned = selectedIds.length !== state.selectedIds.length;
  return { state: pruned ? { ...state, selectedIds } : state, pruned };
}

/** Never repair a bad value in place: the owner can still recover the original bytes. */
export function loadWorkspace(storage: WorkspaceStorage | null, allowedIds: readonly string[]): WorkspaceLoad {
  if (!storage) return { state: null, warning: "storage_unavailable" };
  let value: string | null;
  try { value = storage.getItem(WORKSPACE_KEY); }
  catch { return { state: null, warning: "storage_unavailable" }; }
  if (value === null) return { state: null, warning: null };
  let raw: unknown;
  try { raw = JSON.parse(value); }
  catch { return { state: null, warning: "corrupt" }; }
  if (raw && typeof raw === "object" && "version" in raw && raw.version !== 1) {
    return { state: null, warning: "unsupported_version" };
  }
  const parsed = parseState(raw);
  if (!parsed) return { state: null, warning: "invalid" };
  const result = pruneWorkspaceState(parsed, allowedIds);
  return { state: result.state, warning: result.pruned ? "pruned" : null };
}

function writeFailure(error: unknown): WorkspaceWrite {
  return { ok: false, warning: error && typeof error === "object" && "name" in error
    && error.name === "QuotaExceededError" ? "quota_exceeded" : "storage_unavailable" };
}

export function saveWorkspace(storage: WorkspaceStorage | null, state: WorkspaceState): WorkspaceWrite {
  if (!storage) return { ok: false, warning: "storage_unavailable" };
  const parsed = parseState(state);
  if (!parsed) return { ok: false, warning: "invalid" };
  try { storage.setItem(WORKSPACE_KEY, JSON.stringify(parsed)); return { ok: true }; }
  catch (error) { return writeFailure(error); }
}

export function removeWorkspace(storage: WorkspaceStorage | null): WorkspaceWrite {
  if (!storage) return { ok: false, warning: "storage_unavailable" };
  try { storage.removeItem(WORKSPACE_KEY); return { ok: true }; }
  catch { return { ok: false, warning: "storage_unavailable" }; }
}
