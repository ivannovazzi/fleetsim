import {
  VehicleDTO,
  Route,
  VehicleRoute,
  StartOptions,
  VehicleStatus,
} from "../types";
import { RoadNetwork } from "./RoadNetwork";
import { getVehicles, sendLocation } from "../utils/api";
import { config } from "../utils/config";
import { EventEmitter } from "events";
import * as utils from "../utils/helpers";
import { serializeVehicle } from "../utils/serializer";
import { ManagedVehicle } from "./Vehicle";

export class VehicleManager extends EventEmitter {
  private vehicles: Map<string, ManagedVehicle> = new Map();
  private visitedEdges: Map<string, Set<string>> = new Map();
  private routes: Map<string, Route> = new Map();
  private vehicleIntervals: Map<string, NodeJS.Timeout> = new Map();
  private locationInterval: NodeJS.Timeout | null = null;
  private lastUpdateTimes: Map<string, number> = new Map();

  private options: StartOptions = {
    updateInterval: config.updateInterval,
    minSpeed: config.minSpeed,
    maxSpeed: config.maxSpeed,
    speedVariation: config.speedVariation,
    acceleration: config.acceleration,
    deceleration: config.deceleration,
    turnThreshold: config.turnThreshold,
    heatZoneSpeedFactor: config.heatZoneSpeedFactor,
    updateServer: config.updateServer,
    updateServerTimeout: config.updateServerTimeout,
  };

  constructor(private network: RoadNetwork) {
    super();
    this.init();
  }

  private async init(): Promise<void> {
    const vehiclesData = await getVehicles();
    const medical = vehiclesData.filter(utils.isMedical);
    const onShift = medical.filter(utils.isOnShift);
    const online = medical.filter(utils.isOnline);
    const offline = medical.filter(utils.isOffline);
    const untracked = medical.filter(utils.isUntracked);

    const ordered = [...onShift, ...online, ...offline, ...untracked];
    ordered.forEach((v) => {
      this.addVehicle(v.id, v.callsign, utils.getStatus(v));
    });
  }

  /**
   * Creates a new vehicle with default or random edge start.
   */
  private addVehicle(id: string, name: string, status: VehicleStatus): void {
    const startEdge = this.network.getRandomEdge();

    const flags = {
      hasInternetConnectivity: Math.random() > 0.1,
      hasEngineIssue: Math.random() > 0.95,
      lowFuel: Math.random() > 0.9
    };

    const vehicle = new ManagedVehicle(
      id,
      name,
      status,
      flags,
      startEdge,
      this.options.minSpeed
    );

    this.vehicles.set(id, vehicle);
    this.visitedEdges.set(id, new Set([startEdge.id]));
    this.setRandomDestination(id);
  }

  private async setRandomDestination(vehicleId: string): Promise<void> {
    const vehicle = this.vehicles.get(vehicleId);
    if (!vehicle) return;

    const destination = this.network.getRandomNode();

    const route = this.network.findRoute(
      this.network.findNearestNode(vehicle.position),
      destination
    );

    if (route) {
      this.routes.set(vehicleId, route);
      this.emit("route", {
        vehicleId,
        route: utils.nonCircularRouteEdges(route),
      });
    }
  }

  public startVehicleMovement(vehicleId: string, intervalMs: number): void {
    if (this.vehicleIntervals.has(vehicleId)) {
      clearInterval(this.vehicleIntervals.get(vehicleId)!);
    }
    this.lastUpdateTimes.set(vehicleId, Date.now());
    this.vehicleIntervals.set(
      vehicleId,
      setInterval(() => this.updateSingle(vehicleId), intervalMs)
    );
  }

  public stopVehicleMovement(vehicleId: string): void {
    if (this.vehicleIntervals.has(vehicleId)) {
      clearInterval(this.vehicleIntervals.get(vehicleId)!);
      this.vehicleIntervals.delete(vehicleId);
    }
  }

  public startLocationUpdates(intervalMs: number): void {
    if (this.locationInterval) {
      clearInterval(this.locationInterval);
    }
    this.locationInterval = setInterval(async () => {
      if (!this.options.updateServer) return;

      const vehicles = Array.from(this.vehicles.values());
      await sendLocation(
        vehicles.map((v) => ({
          latitude: v.position[0],
          longitude: v.position[1],
          id: v.id,
          positionReceivedAt: new Date().toISOString(),
          positionOriginRefId: "b13c099c-ab20-11ea-8f69-0673f8c18e22",
        }))
      );
    }, intervalMs);
  }

  public stopLocationUpdates(): void {
    if (this.locationInterval) {
      clearInterval(this.locationInterval);
      this.locationInterval = null;
    }
  }

  public setOptions(options: Partial<StartOptions>): void {
    this.options = { ...this.options, ...options };
    this.emit("options", this.options);
  }

  public getOptions(): StartOptions {
    return this.options;
  }

  private updateSingle(vehicleId: string): void {
    const vehicle = this.vehicles.get(vehicleId);
    if (!vehicle) return;

    const now = Date.now();
    const lastTime = this.lastUpdateTimes.get(vehicleId) ?? now;
    const deltaMs = now - lastTime;
    this.lastUpdateTimes.set(vehicleId, now);

    vehicle.update(deltaMs, this.options, this.network);
    this.emit("update", serializeVehicle(vehicle));
  }  

  public async findAndSetRoutes(
    vehicleId: string,
    destination: [number, number]
  ): Promise<void> {
    const vehicle = this.vehicles.get(vehicleId);
    if (!vehicle) throw new Error(`Vehicle ${vehicleId} not found`);

    const endNode = this.network.findNearestNode(destination);
    const startNode = this.network.findNearestNode(vehicle.position);

    if (
      startNode.connections.length === 0 ||
      endNode.connections.length === 0
    ) {
      console.error("Start/end node has no connections");
      return;
    }

    const route = this.network.findRoute(startNode, endNode);
    if (!route) {
      console.error("No route found to destination");
      return;
    }

    this.emit("route", {
      vehicleId,
      route: utils.nonCircularRouteEdges(route),
    });
    this.routes.set(vehicleId, route);
    vehicle.currentEdge = route.edges[0];
    vehicle.progress = 0;
  }

  public getVehicles(): VehicleDTO[] {
    return Array.from(this.vehicles.values()).map(serializeVehicle);
  }

  public getRoutes(): VehicleRoute[] {
    return Array.from(this.routes.entries()).map(([id, route]) => ({
      vehicleId: id,
      route: utils.nonCircularRouteEdges(route),
    }));
  }

  public isRunning(): boolean {
    return this.vehicleIntervals.size > 0;
  }
}
