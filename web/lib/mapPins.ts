import { BAND_COLOR, displayScore, type Band } from "./model";
import type { Site } from "./sites";
import type { MapPin } from "@/app/components/PinMap";

export type MapPinProject = Pick<Site, "project_id" | "name" | "lat" | "lng" | "band" | "p_stopped">;

export function getAvailableMapPinId(selectedId: string | null, pins: readonly MapPin[]): string | null {
  return selectedId && pins.some((pin) => pin.id === selectedId) ? selectedId : pins[0]?.id ?? null;
}

/** Build display-only markers; projects with invalid geographic coordinates cannot be mapped. */
export function buildMapPins(projects: readonly MapPinProject[]): MapPin[] {
  return projects.flatMap((project) => {
    if (
      !Number.isFinite(project.lat) ||
      !Number.isFinite(project.lng) ||
      project.lat < -90 ||
      project.lat > 90 ||
      project.lng < -180 ||
      project.lng > 180
    ) return [];
    const score = displayScore(project.p_stopped);
    const colorBand: Band | "none" = score === null ? "none" : project.band ?? "none";
    return [{
      id: project.project_id,
      name: project.name,
      lat: project.lat,
      lng: project.lng,
      color: BAND_COLOR[colorBand],
      text: score === null ? "Unscored" : `${score}/100`,
    }];
  });
}
