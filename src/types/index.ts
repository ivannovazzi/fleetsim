export enum VehicleStatus {
  ONSHIFT = "ONSHIFT",
  ONLINE = "ONLINE",
  OFFLINE = "OFFLINE",
  UNTRACKED = "UNTRACKED",
  UNKNOWN = "UNKNOWN",
}
export interface DataVehicle {
  id: string;
  name: string;
  status: VehicleStatus;
  position: [number, number];
}
export interface Node {
  id: string;
  coordinates: [number, number];
  connections: Edge[];
}

export interface Edge {
  id: string;
  streetId: string;
  name?: string;
  start: Node;
  end: Node;
  distance: number;
  bearing: number;
}

export interface VehicleFlags {
  hasInternetConnectivity: boolean;
  hasEngineIssue: boolean;
  lowFuel: boolean;
  isInHeatZone: boolean;
}

export interface Vehicle {
  id: string;
  name: string;
  status: VehicleStatus;
  flags: VehicleFlags;
  currentEdge: Edge;
  position: [number, number];
  speed: number;
  bearing: number;
  progress: number;
}

export interface VehicleDTO {
  id: string;
  name: string;
  status: VehicleStatus;
  flags: VehicleFlags;
  position: [number, number];
  speed: number;
  heading: number;
}

export interface SimulationStatus {
  interval: number;
  running: boolean;
  adapterTimeout: number;
}

export interface PathNode {
  id: string;
  gScore: number;
  fScore: number;
}

export interface POI {
  id: string;
  name: string | null;
  coordinates: [number, number];
  type: string;
}

export interface Route {
  edges: Edge[];
  distance: number;
}

export interface StartOptions {
  minSpeed: number;
  maxSpeed: number;
  speedVariation: number;
  acceleration: number;
  deceleration: number;
  turnThreshold: number;
  heatZoneSpeedFactor: number;
  updateInterval: number;
  editAdapter: boolean;
  useAdapter: boolean;
  syncAdapter: boolean;
  syncAdapterTimeout: number;
}

export interface DirectionRequest {
  id: string;
  lat: number;
  lng: number;
}

export interface Direction {
  vehicleId: string;
  route: Route;
}

export interface HeatZoneProperties {
  id: string;
  intensity: number;
  timestamp: string;
  radius: number;
}

export interface HeatZone {
  polygon: number[][];
  intensity: number; // 0-1 scale
  timestamp: string;
}

export interface HeatZoneFeature {
  type: "Feature";
  properties: {
    id: string;
    intensity: number;
    timestamp: string;
    radius: number;
  };
  geometry: {
    type: "Polygon";
    coordinates: [number, number][];
  };
}
