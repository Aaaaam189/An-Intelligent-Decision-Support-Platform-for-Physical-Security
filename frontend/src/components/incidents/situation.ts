import type { Incident } from "../../types/incident.types";

/**
 * Short description of what the situation involves, e.g.
 * "vehicle · people · weapon". No head counts: the AI only tells one from
 * several. Empty for older incidents created before situation tracking existed.
 */
export function formatObjectCounts(
  incident: Pick<Incident, "peakVehicleCount" | "peakPersonCount" | "weaponCount">
): string {
  const parts: string[] = [];
  const vehicles = incident.peakVehicleCount ?? 0;
  const people = incident.peakPersonCount ?? 0;
  const weapons = incident.weaponCount ?? 0;
  if (vehicles > 0) parts.push(vehicles > 1 ? "vehicles" : "vehicle");
  if (people > 0) parts.push(people > 1 ? "people" : "person");
  if (weapons > 0) parts.push("weapon");
  return parts.join(" · ");
}
