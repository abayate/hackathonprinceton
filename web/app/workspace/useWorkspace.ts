"use client";

import { useCallback, useEffect, useReducer, useRef, type Dispatch, type SetStateAction } from "react";
import { emptyWorkspace, type WorkspaceState } from "@/lib/workspaceTypes";
import {
  loadWorkspace, pruneWorkspaceState, removeWorkspace, saveWorkspace,
  type WorkspaceStorage, type WorkspaceStorageWarning,
} from "@/lib/workspaceStorage";

type View = { state: WorkspaceState; ready: boolean; revision: number; epoch: number; warning: WorkspaceStorageWarning | null };
type Action =
  | { type: "hydrate"; state: WorkspaceState | null; warning: WorkspaceStorageWarning | null }
  | { type: "edit"; change: SetStateAction<WorkspaceState> }
  | { type: "prune"; allowedIds: string[] }
  | { type: "reset"; epoch: number; warning: WorkspaceStorageWarning | null }
  | { type: "saved" }
  | { type: "warning"; warning: WorkspaceStorageWarning | null };

function reduce(view: View, action: Action): View {
  switch (action.type) {
    case "hydrate":
      return { state: action.state ?? emptyWorkspace(), ready: true, revision: 0, epoch: view.epoch, warning: action.warning };
    case "edit": {
      if (!view.ready) return view;
      const next = typeof action.change === "function" ? action.change(view.state) : action.change;
      return { ...view, state: { ...next, updatedAt: new Date().toISOString() }, revision: view.revision + 1 };
    }
    case "prune": {
      if (!view.ready) return view;
      const result = pruneWorkspaceState(view.state, action.allowedIds);
      return result.pruned
        ? { ...view, state: result.state, revision: view.revision + 1, warning: "pruned" }
        : view;
    }
    case "reset":
      return { state: emptyWorkspace(), ready: true, revision: 0, epoch: action.epoch, warning: action.warning };
    case "saved":
      return view.warning === "pruned" || view.warning === null ? view : { ...view, warning: null };
    case "warning":
      return view.warning === action.warning ? view : { ...view, warning: action.warning };
  }
}

function browserStorage(): WorkspaceStorage | null {
  try { return window.localStorage; }
  catch { return null; }
}

function warningMessage(warning: WorkspaceStorageWarning | null): string | null {
  switch (warning) {
    case "storage_unavailable": return "Browser storage is unavailable. Changes will stay in this tab only.";
    case "quota_exceeded": return "Browser storage is full. Changes will stay in this tab until space is available.";
    case "corrupt": return "The saved workspace could not be read. It was left untouched. New changes are not being saved; reset to start a new saved workspace.";
    case "invalid": return "The saved workspace is invalid. It was left untouched. New changes are not being saved; reset to start a new saved workspace.";
    case "unsupported_version": return "This browser has a workspace from a newer version. It was left untouched. New changes are not being saved; reset to start a new saved workspace.";
    case "pruned": return "A saved selection is no longer proposed. Its notes, decision and tasks were kept.";
    default: return null;
  }
}

/** One local browser workspace; no account sync or background fetching. */
export function useWorkspace(allowedIds: string[]): {
  state: WorkspaceState; setState: Dispatch<SetStateAction<WorkspaceState>>;
  ready: boolean; storageMessage: string | null; reset: () => boolean;
} {
  const [view, dispatch] = useReducer(reduce, undefined, (): View => ({
    state: emptyWorkspace(), ready: false, revision: 0, epoch: 0, warning: null,
  }));
  const storage = useRef<WorkspaceStorage | null>(null);
  const writeLocked = useRef(false);
  const currentEpoch = useRef(0);
  const initialAllowedIds = useRef(allowedIds);
  const allowedIdsKey = JSON.stringify(allowedIds);

  useEffect(() => {
    storage.current = browserStorage();
    const loaded = loadWorkspace(storage.current, initialAllowedIds.current);
    writeLocked.current = loaded.warning === "corrupt" || loaded.warning === "invalid"
      || loaded.warning === "unsupported_version";
    dispatch({ type: "hydrate", ...loaded });
  }, []);

  useEffect(() => {
    if (view.ready) dispatch({ type: "prune", allowedIds: JSON.parse(allowedIdsKey) as string[] });
  }, [allowedIdsKey, view.ready]);

  useEffect(() => {
    if (!view.ready || view.revision === 0 || writeLocked.current || view.epoch !== currentEpoch.current) return;
    const result = saveWorkspace(storage.current, view.state);
    dispatch(result.ok ? { type: "saved" } : { type: "warning", warning: result.warning });
  }, [view.ready, view.revision, view.state, view.epoch]);

  const setState: Dispatch<SetStateAction<WorkspaceState>> = useCallback((change) => {
    dispatch({ type: "edit", change });
  }, []);

  const reset = useCallback(() => {
    const result = removeWorkspace(storage.current);
    if (!result.ok) {
      writeLocked.current = true;
      dispatch({ type: "warning", warning: result.warning });
      return false;
    }
    currentEpoch.current += 1;
    writeLocked.current = false;
    dispatch({ type: "reset", epoch: currentEpoch.current, warning: null });
    return true;
  }, []);

  return { state: view.state, setState, ready: view.ready,
    storageMessage: warningMessage(view.warning), reset };
}
