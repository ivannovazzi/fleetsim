export enum VehicleTrackingTypes {
  FLARE_APP = 'FLARE_APP',
  FLARE_APP_AND_GPS = 'FLARE_APP_AND_GPS',
  FLARE_GPS = 'FLARE_GPS',
  UNTRACKED = 'UNTRACKED'
}

export interface ApiVehicleModel {
  id: string;
  callsign: string;
  isOnline: boolean;
  _currentShift: { id: string } | null;
  _trackingType: VehicleTrackingTypes;
  vehicleTypeRef: { value: string };
}

export interface Node {
  id: string;
  coordinates: [number, number];
  connections: Edge[];
}

export interface Edge {
  id: string;
  streetId: string;
  start: Node;
  end: Node;
  distance: number;
  bearing: number;
}

export interface Vehicle {
  id: string;
  name: string;
  status: string;
  currentEdge: Edge;
  position: [number, number];
  speed: number;
  bearing: number;
  progress: number;
}

export enum VehicleStatus {
  ONSHIFT = "ONSHIFT",
  ONLINE = "ONLINE",
  OFFLINE = "OFFLINE",
  UNTRACKED = "UNTRACKED",
  UNKNOWN = "UNKNOWN"
}
export interface VehicleDTO {
  id: string;
  name: string;
  status: VehicleStatus;
  position: [number, number];
  speed: number;
  heading: number;
}


export interface SimulationStatus {
  interval: number;
  running: boolean;
  vehicleCount: number;
  vehicles: VehicleDTO[];
}

export interface PathNode {
  id: string;
  gScore: number;
  fScore: number;
}

export interface Route {
  edges: Edge[];
  distance: number;
}