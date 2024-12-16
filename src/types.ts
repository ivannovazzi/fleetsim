export enum VehicleTrackingTypes {
  FLARE_APP = 'FLARE_APP',
  FLARE_APP_AND_GPS = 'FLARE_APP_AND_GPS',
  FLARE_GPS = 'FLARE_GPS',
  UNTRACKED = 'UNTRACKED'
}

export interface Vehicle {
  id: string;
  callsign: string;
  isOnline: boolean;
  _currentShift: { id: string } | null;
  _trackingType: VehicleTrackingTypes;
  vehicleTypeRef: { value: string };
}
