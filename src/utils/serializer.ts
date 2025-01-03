import { Vehicle, VehicleDTO } from '../types';

export function serializeVehicle(vehicle: Vehicle): VehicleDTO {
  return {
    id: vehicle.id,
    name: vehicle.name,
    status: vehicle.status,
    flags: vehicle.flags,
    position: vehicle.position,
    speed: vehicle.speed,
    heading: vehicle.bearing
  };
}