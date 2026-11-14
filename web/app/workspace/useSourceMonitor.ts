"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { applyCheck, parseSourceCheck } from "@/lib/sourceMonitor";
import { MONITOR_KEY, loadMonitor, removeMonitor, saveMonitor, type MonitorStorageWarning } from "@/lib/sourceMonitorStorage";
import { emptyMonitor, MONITOR_INTERVAL_MS, MONITOR_MAX_SNAPSHOTS, MONITOR_MAX_SOURCES, type CheckStatus, type MonitorState, type SourceCheck, type WatchedSource } from "@/lib/sourceMonitorTypes";
import type { Candidate } from "@/lib/workspaceTypes";

export type LatestSourceCheck = { status: CheckStatus; check: SourceCheck; readableCheck?: SourceCheck };

function storageWarning(warning: MonitorStorageWarning | null): string | null {
  if (!warning) return null;
  if (warning === "storage_unavailable") return "Source history cannot be saved in this browser. Changes stay in this tab only.";
  if (warning === "quota_exceeded") return "Browser storage is full. New source checks and reviews are not saved yet.";
  if (warning === "external_change") return "Source history changed in another tab. Checks and reviews are paused to preserve that work. Reload this page to use the latest source history.";
  return "Saved source history could not be read safely and was left untouched. New checks and reviews are not being saved. Start over to replace it.";
}

export function useSourceMonitor(candidates: Candidate[], watched: WatchedSource[], selectedIds: string[]) {
  const [state, setState] = useState<MonitorState>(emptyMonitor);
  const [ready, setReady] = useState(false);
  const [warning, setWarning] = useState<MonitorStorageWarning | null>(null);
  const [conflict, setConflict] = useState(false);
  const [messages, setMessages] = useState<Record<string, string>>({});
  const [activeIds, setActiveIds] = useState<string[]>([]);
  const [latest, setLatest] = useState<Record<string, LatestSourceCheck>>({});
  const current = useRef(state);
  const storage = useRef<Storage | null>(null);
  const writeLocked = useRef(false);
  const conflictRef = useRef(false);
  const persistedRaw = useRef<string | null>(null);
  const readyRef = useRef(false);
  const epoch = useRef(0);
  const inFlight = useRef(new Map<string, AbortController>());
  const batchEpoch = useRef<number | null>(null);
  const selection = useRef(selectedIds);
  selection.current = selectedIds;
  const sourceMap = useMemo(() => new Map(watched.map((source) => [source.id, source])), [watched]);
  const candidateMap = useMemo(() => new Map(candidates.map((candidate) => [candidate.id, candidate])), [candidates]);

  const lockForExternalChange = useCallback(() => {
    conflictRef.current = true;
    writeLocked.current = true;
    epoch.current += 1;
    batchEpoch.current = null;
    inFlight.current.forEach((controller) => controller.abort());
    inFlight.current.clear();
    setActiveIds([]);
    current.current = { ...current.current, autoRecheck: false };
    setState(current.current);
    setConflict(true);
    setWarning("external_change");
  }, []);

  useEffect(() => {
    const requests = inFlight.current;
    try { storage.current = window.localStorage; } catch { storage.current = null; }
    const loaded = loadMonitor(storage.current);
    persistedRaw.current = loaded.raw;
    writeLocked.current = loaded.warning === "corrupt" || loaded.warning === "invalid" || loaded.warning === "unsupported_version";
    current.current = loaded.state ?? emptyMonitor();
    setState(current.current);
    setWarning(loaded.warning);
    readyRef.current = true;
    setReady(true);
    const onStorage = (event: StorageEvent) => {
      if (event.storageArea === storage.current && (event.key === MONITOR_KEY || event.key === null)
        && event.newValue !== persistedRaw.current) lockForExternalChange();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
      readyRef.current = false;
      epoch.current += 1;
      requests.forEach((controller) => controller.abort());
      requests.clear();
    };
  }, [lockForExternalChange]);

  const update = useCallback((next: MonitorState) => {
    if (conflictRef.current) return false;
    if (!writeLocked.current) {
      const result = saveMonitor(storage.current, next, persistedRaw.current);
      if (!result.ok && result.warning === "external_change") { lockForExternalChange(); return false; }
      if (result.ok && result.raw !== undefined) persistedRaw.current = result.raw;
      setWarning(result.ok ? null : result.warning);
    }
    current.current = next;
    setState(next);
    return true;
  }, [lockForExternalChange]);

  const checkProject = useCallback(async (projectId: string) => {
    if (!readyRef.current || conflictRef.current || inFlight.current.has(projectId)) return;
    const candidate = candidateMap.get(projectId);
    const sources = watched.filter((source) => source.projectId === projectId).slice(0, MONITOR_MAX_SOURCES);
    if (!candidate || !sources.length) return;
    const missingCount = sources.filter((source) => !current.current.snapshots[source.id]).length;
    if (Object.keys(current.current.snapshots).length + missingCount > MONITOR_MAX_SNAPSHOTS) {
      setMessages((previous) => ({ ...previous, [projectId]: "Source history has reached its limit. Your existing history is kept; start over to create a fresh workspace." }));
      return;
    }
    const controller = new AbortController();
    const runEpoch = epoch.current;
    inFlight.current.set(projectId, controller);
    setActiveIds([...inFlight.current.keys()]);
    setMessages((previous) => ({ ...previous, [projectId]: "" }));
    const timeout = window.setTimeout(() => controller.abort(), 120000);
    try {
      const response = await fetch("/api/sources/check", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId }), signal: controller.signal });
      if (runEpoch !== epoch.current || !readyRef.current) return;
      if (!response.ok) {
        setMessages((previous) => ({ ...previous, [projectId]: response.status === 429 ? "Source checks are busy. Wait a moment, then check again. Your last good text is kept." : "This check could not finish. Your last good text is kept; try again shortly." }));
        return;
      }
      const raw: unknown = await response.json();
      if (runEpoch !== epoch.current || !readyRef.current) return;
      if (!raw || typeof raw !== "object" || !("projectId" in raw) || raw.projectId !== projectId || !("checks" in raw) || !Array.isArray(raw.checks) || raw.checks.length > MONITOR_MAX_SOURCES) throw new Error("Invalid source response");
      const checks = raw.checks.map(parseSourceCheck);
      if (checks.some((check) => check === null) || new Set(checks.map((check) => check?.sourceId)).size !== checks.length || checks.some((check) => sourceMap.get(check!.sourceId)?.projectId !== projectId)) throw new Error("Invalid source response");
      const newCount = checks.filter((check) => !current.current.snapshots[check!.sourceId]).length;
      if (Object.keys(current.current.snapshots).length + newCount > MONITOR_MAX_SNAPSHOTS) {
        setMessages((previous) => ({ ...previous, [projectId]: "Source history reached its limit while this check was running. The previous history is kept; these results were not added." }));
        return;
      }
      const terms = [candidate.name, candidate.company, candidate.city?.replace(/ city$/, "")].filter((term): term is string => !!term);
      const snapshots = { ...current.current.snapshots };
      const results: Record<string, LatestSourceCheck> = {};
      for (const check of checks) {
        if (!check) continue;
        const source = sourceMap.get(check.sourceId)!;
        const result = applyCheck(snapshots[source.id] ?? null, check, terms, source);
        snapshots[source.id] = result.snapshot;
        results[source.id] = { status: result.status, check };
      }
      if (!update({ ...current.current, snapshots })) return;
      setLatest((previous) => ({ ...previous, ...Object.fromEntries(Object.entries(results).map(([id, result]) => [id, {
        ...result, readableCheck: result.check.outcome === "ok" ? result.check : previous[id]?.readableCheck,
      }])) }));
      if (checks.length < sources.length) setMessages((previous) => ({ ...previous, [projectId]: "Some sources were not returned by this check. Their earlier status is kept." }));
    } catch {
      if (runEpoch === epoch.current && readyRef.current) setMessages((previous) => ({ ...previous, [projectId]: controller.signal.aborted ? "The source check timed out. Your last good text is kept." : "The source check could not be read. Your last good text is kept; try again." }));
    } finally {
      window.clearTimeout(timeout);
      if (inFlight.current.get(projectId) === controller) {
        inFlight.current.delete(projectId);
        if (readyRef.current) setActiveIds([...inFlight.current.keys()]);
      }
    }
  }, [candidateMap, watched, sourceMap, update]);

  const checkAll = useCallback(async (automatic = false) => {
    if (batchEpoch.current !== null || inFlight.current.size || !readyRef.current || conflictRef.current) return;
    const runEpoch = epoch.current;
    batchEpoch.current = runEpoch;
    try {
      for (const projectId of selection.current) {
        if (runEpoch !== epoch.current || !readyRef.current) break;
        if (automatic && (document.visibilityState !== "visible" || !current.current.autoRecheck)) break;
        await checkProject(projectId);
      }
    } finally { if (batchEpoch.current === runEpoch) batchEpoch.current = null; }
  }, [checkProject]);

  useEffect(() => {
    if (!ready || !state.autoRecheck) return;
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void checkAll(true);
    }, MONITOR_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [ready, state.autoRecheck, checkAll]);

  const setAutoRecheck = useCallback((enabled: boolean) => {
    if (readyRef.current) update({ ...current.current, autoRecheck: enabled });
  }, [update]);

  const markReviewed = useCallback((sourceId: string, hash: string) => {
    const snapshot = current.current.snapshots[sourceId];
    if (!snapshot || !readyRef.current) return;
    update({ ...current.current, snapshots: { ...current.current.snapshots, [sourceId]: { ...snapshot, pending: snapshot.pending.filter((item) => item.hash !== hash) } } });
  }, [update]);

  const readableChecksFor = useCallback((projectId: string): SourceCheck[] => watched
    .filter((source) => source.projectId === projectId)
    .flatMap((source) => {
      const check = latest[source.id]?.readableCheck;
      return check?.outcome === "ok"
        ? [{ ...check, paragraphs: check.paragraphs.map((paragraph) => ({ ...paragraph })) }]
        : [];
    }), [watched, latest]);

  const reset = useCallback((): boolean => {
    if (conflictRef.current) return false;
    epoch.current += 1;
    batchEpoch.current = null;
    inFlight.current.forEach((controller) => controller.abort());
    inFlight.current.clear();
    setActiveIds([]);
    const result = removeMonitor(storage.current, persistedRaw.current);
    if (!result.ok) {
      if (result.warning === "external_change") lockForExternalChange();
      else setWarning(result.warning);
      return false;
    }
    writeLocked.current = false;
    conflictRef.current = false;
    persistedRaw.current = null;
    current.current = emptyMonitor();
    setState(current.current);
    setWarning(null);
    setConflict(false);
    setLatest({});
    setMessages({});
    return true;
  }, [lockForExternalChange]);

  return { state, ready, conflict, storageMessage: storageWarning(warning), messages, activeIds, latest,
    readableChecksFor, checkProject, checkAll, setAutoRecheck, markReviewed, reset };
}

export type SourceMonitor = ReturnType<typeof useSourceMonitor>;
