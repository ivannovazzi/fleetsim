import { ApiVehicleModel, MedicalType, Route, VehicleStatus } from "../types";

export function isMedical(vehicle: ApiVehicleModel) {
  return [...Object.values(MedicalType) as string[]].includes(vehicle.vehicleTypeRef.value);
}

export function isOnShift(vehicle: ApiVehicleModel) {
  return !!vehicle._currentShift;
}

export function isOnline(vehicle: ApiVehicleModel) {
  return vehicle.isOnline && !vehicle._currentShift;
}

export function isOffline(vehicle: ApiVehicleModel) {
  return !vehicle.isOnline && vehicle._trackingType !== "UNTRACKED";
}

export function isUntracked(vehicle: ApiVehicleModel) {
  return vehicle._trackingType === "UNTRACKED";
}

export function getStatus(vehicle: ApiVehicleModel): VehicleStatus {
  if (isOnShift(vehicle)) {
    return VehicleStatus.ONSHIFT;
  }
  if (isOnline(vehicle)) {
    return VehicleStatus.ONLINE;
  }
  if (isOffline(vehicle)) {
    return VehicleStatus.OFFLINE;
  }
  if (isUntracked(vehicle)) {
    return VehicleStatus.UNTRACKED;
  }
  return VehicleStatus.UNKNOWN;
}

export function calculateBearing(start: [number, number], end: [number, number]): number {
  const [lat1, lon1] = start.map(x => x * Math.PI / 180);
  const [lat2, lon2] = end.map(x => x * Math.PI / 180);
  
  const y = Math.sin(lon2 - lon1) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) -
            Math.sin(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

export function interpolatePosition(
  start: [number, number], 
  end: [number, number], 
  fraction: number
): [number, number] {
  return [
    start[0] + (end[0] - start[0]) * fraction,
    start[1] + (end[1] - start[1]) * fraction
  ];
}

export function calculateDistance(p1: [number, number], p2: [number, number]): number {
  const R = 6371; // Earth's radius in km
  const [lat1, lon1] = p1.map(x => x * Math.PI / 180);
  const [lat2, lon2] = p2.map(x => x * Math.PI / 180);
  
  const dLat = lat2 - lat1;
  const dLon = lon2 - lon1;
  
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
           Math.cos(lat1) * Math.cos(lat2) *
           Math.sin(dLon/2) * Math.sin(dLon/2);
  
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

export function nonCircularRouteEdges(route: Route): Route {
      return {
        ...route,
        edges: route.edges.map((edge) => ({
          ...edge,
          start: { ...edge.start, connections: [] },
          end: { ...edge.end, connections: [] },
        })),
      };
    }