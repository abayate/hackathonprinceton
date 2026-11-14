import { describe, expect, it } from "vitest";
import { emptyWorkspace, type WorkspaceState } from "./workspaceTypes";
import { loadWorkspace, removeWorkspace, saveWorkspace, WORKSPACE_KEY, type WorkspaceStorage } from "./workspaceStorage";

const known = "11111111-1111-4111-8111-111111111111";
const deleted = "22222222-2222-4222-8222-222222222222";
const taskId = "33333333-3333-4333-8333-333333333333";

function memoryStorage(initial?: string): WorkspaceStorage & { values: Map<string, string> } {
  const values = new Map<string, string>(initial === undefined ? [] : [[WORKSPACE_KEY, initial]]);
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); },
  };
}

function savedState(): WorkspaceState {
  return {
    ...emptyWorkspace(),
    selectedIds: [known, deleted],
    decisions: { [known]: "pursue", [deleted]: "drop" },
    notes: { [known]: "Call the utility", [deleted]: "Old note" },
    tasks: [
      { id: taskId, projectId: known, checkId: null, text: "Confirm power", origin: "user", done: false },
      { id: deleted, projectId: deleted, checkId: null, text: "Old task", origin: "user", done: false },
    ],
  };
}

describe("workspace browser storage", () => {
  it("round trips a valid state under one versioned key", () => {
    const storage = memoryStorage();
    const state = savedState();
    expect(saveWorkspace(storage, state)).toEqual({ ok: true });
    expect([...storage.values.keys()]).toEqual([WORKSPACE_KEY]);
    expect(loadWorkspace(storage, [known, deleted])).toEqual({ state, warning: null });
  });

  it("drops a departed project from selection while retaining its notes, decision and tasks", () => {
    const original = JSON.stringify(savedState());
    const storage = memoryStorage(original);
    const result = loadWorkspace(storage, [known]);
    expect(result.warning).toBe("pruned");
    expect(result.state).toMatchObject({
      selectedIds: [known], decisions: { [known]: "pursue", [deleted]: "drop" },
      notes: { [known]: "Call the utility", [deleted]: "Old note" },
      tasks: [
        { id: taskId, projectId: known, text: "Confirm power" },
        { id: deleted, projectId: deleted, text: "Old task" },
      ],
    });
    expect(storage.values.get(WORKSPACE_KEY)).toBe(original);
  });

  it("keeps corrupt and future-version bytes untouched so an automatic load cannot destroy them", () => {
    const corrupt = memoryStorage("{bad json");
    expect(loadWorkspace(corrupt, [known])).toEqual({ state: null, warning: "corrupt" });
    expect(corrupt.values.get(WORKSPACE_KEY)).toBe("{bad json");

    const future = JSON.stringify({ ...savedState(), version: 2 });
    const storage = memoryStorage(future);
    expect(loadWorkspace(storage, [known])).toEqual({ state: null, warning: "unsupported_version" });
    expect(storage.values.get(WORKSPACE_KEY)).toBe(future);
  });

  it("rejects a malformed current-version value and refuses to save an invalid edit", () => {
    const original = JSON.stringify({ ...savedState(), selectedIds: [known, known] });
    const storage = memoryStorage(original);
    expect(loadWorkspace(storage, [known])).toEqual({ state: null, warning: "invalid" });
    expect(saveWorkspace(storage, { ...savedState(), selectedIds: [known, known] })).toEqual({
      ok: false, warning: "invalid",
    });
    expect(storage.values.get(WORKSPACE_KEY)).toBe(original);
  });

  it("reports blocked reads, quota failures, and blocked removal without throwing", () => {
    const blocked: WorkspaceStorage = {
      getItem: () => { throw new DOMException("Denied", "SecurityError"); },
      setItem: () => { throw new DOMException("Full", "QuotaExceededError"); },
      removeItem: () => { throw new DOMException("Denied", "SecurityError"); },
    };
    expect(loadWorkspace(blocked, [known])).toEqual({ state: null, warning: "storage_unavailable" });
    expect(saveWorkspace(blocked, savedState())).toEqual({ ok: false, warning: "quota_exceeded" });
    expect(removeWorkspace(blocked)).toEqual({ ok: false, warning: "storage_unavailable" });
  });

  it("removes only the workspace key when reset succeeds", () => {
    const storage = memoryStorage(JSON.stringify(savedState()));
    storage.values.set("other.app", "keep");
    expect(removeWorkspace(storage)).toEqual({ ok: true });
    expect([...storage.values.entries()]).toEqual([["other.app", "keep"]]);
  });
});
