import { Vehicle } from "./types";

export function isMedical(vehicle: Vehicle) {
  return [
    "ALS",
    "BLS",
    "UNSUPPORTED",
    "MEDICAL_TAXI",
    "MEDICAL_MOTORBIKE",
    "HEARSE",
  "BOAT"].includes(vehicle.vehicleTypeRef.value);
}

export function isOnShift(vehicle: Vehicle) {
  return !!vehicle._currentShift;
}

export function isOnline(vehicle: Vehicle) {
  return vehicle.isOnline && !vehicle._currentShift;
}

export function isOffline(vehicle: Vehicle) {
  return !vehicle.isOnline && vehicle._trackingType !== "UNTRACKED";
}

export function isUntracked(vehicle: Vehicle) {
  return vehicle._trackingType === "UNTRACKED";
}

export const logVehicleStatuses = (vehicles: Vehicle[]) => {
  const medical = vehicles.filter(isMedical);
  const onShift = medical.filter(isOnShift);
  const online = medical.filter(isOnline);
  const offline = medical.filter(isOffline);
  const untracked = medical.filter(isUntracked);

  console.log('\n=== Vehicle Status Summary ===');
  console.log(`Total Medical Vehicles: ${medical.length}`);
  console.log(`On Shift: ${onShift.length}`);
  console.log('- ' + onShift.map(v => v.callsign).join(', '));
  console.log(`Online: ${online.length}`);
  console.log('- ' + online.map(v => v.callsign).join(', '));
  console.log(`Offline: ${offline.length}`);
  console.log(`Untracked: ${untracked.length}`);
  console.log('===========================\n');

  return { medical, onShift, online, offline, untracked };
};

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