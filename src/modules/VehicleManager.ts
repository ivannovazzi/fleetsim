import {
  Vehicle,
  Edge,
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

export class VehicleManager extends EventEmitter {
  private vehicles: Map<string, Vehicle> = new Map();
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

    this.vehicles.set(id, {
      id,
      name,
      status,
      flags: {
        isInHeatZone: false,
        hasInternetConnectivity: Math.random() > 0.3,
        hasEngineIssue: Math.random() > 0.95,
        lowFuel: Math.random() > 0.7,
      },
      currentEdge: startEdge,
      position: startEdge.start.coordinates,
      speed: this.options.minSpeed,
      bearing: startEdge.bearing,
      progress: 0,
    });

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
    const lastUpdate = this.lastUpdateTimes.get(vehicleId) ?? now;
    const deltaMs = now - lastUpdate;
    this.lastUpdateTimes.set(vehicleId, now);

    this.updateVehicle(vehicle, deltaMs);

    this.emit("update", serializeVehicle(vehicle));
  }

  private updateVehicle(vehicle: Vehicle, deltaMs: number): void {
    const route = this.routes.get(vehicle.id);
    this.updateSpeed(vehicle, deltaMs);

    if (!route || route.edges.length === 0) {
      this.updatePosition(vehicle, deltaMs);
      this.setRandomDestination(vehicle.id);
    } else {
      this.updatePositionOnRoute(vehicle, route, deltaMs);
    }
  }

  private updateSpeed(vehicle: Vehicle, deltaMs: number): void {
    const nextEdge = this.getNextEdge(vehicle);
    const isInHeatZone = this.network.isPositionInHeatZone(vehicle.position);
    const speedFactor = isInHeatZone ? this.options.heatZoneSpeedFactor : 1;

    if (!nextEdge) {
      vehicle.speed = Math.max(
        this.options.minSpeed,
        this.computeNewSpeed(vehicle.speed, this.options.deceleration, deltaMs)
      );
      return;
    }

    const bearingDiff = Math.abs(nextEdge.bearing - vehicle.bearing);
    if (bearingDiff > this.options.turnThreshold) {
      vehicle.speed = this.safeSpeed(
        this.computeNewSpeed(vehicle.speed, this.options.deceleration, deltaMs),
        speedFactor
      );
    } else {
      vehicle.speed = this.safeSpeed(
        this.computeNewSpeed(
          vehicle.speed,
          -this.options.acceleration,
          deltaMs
        ),
        speedFactor
      );
    }
    vehicle.flags.isInHeatZone = this.network.isPositionInHeatZone(
      vehicle.position
    );
  }

  private computeNewSpeed(
    currentSpeed: number,
    accel: number,
    deltaMs: number
  ): number {
    const deltaHours = deltaMs / 3600000;
    return currentSpeed + accel * deltaHours;
  }

  private safeSpeed(newSpeed: number, speedFactor: number): number {
    let s = newSpeed * speedFactor;
    s = Math.min(this.options.maxSpeed, Math.max(this.options.minSpeed, s));

    const variationFactor =
      1 +
      (Math.random() * this.options.speedVariation * 2 -
        this.options.speedVariation);
    s *= variationFactor;

    return Math.min(this.options.maxSpeed, Math.max(this.options.minSpeed, s));
  }

  private getNextEdge(vehicle: Vehicle): Edge {
    const currentEdge = vehicle.currentEdge;
    const possibleEdges = this.network.getConnectedEdges(currentEdge);
    if (possibleEdges.length === 0) {
      return {
        ...currentEdge,
        start: currentEdge.end,
        end: currentEdge.start,
        bearing: (currentEdge.bearing + 180) % 360,
      };
    }
    const unvisitedEdges = possibleEdges.filter(
      (e) => !this.visitedEdges.get(vehicle.id)?.has(e.id)
    );
    if (unvisitedEdges.length > 0) {
      const nextEdge =
        unvisitedEdges[Math.floor(Math.random() * unvisitedEdges.length)];
      this.visitedEdges.get(vehicle.id)?.add(nextEdge.id);
      return nextEdge;
    }
    return possibleEdges[Math.floor(Math.random() * possibleEdges.length)];
  }

  /**
   * Random movement update.
   */
  private updatePosition(vehicle: Vehicle, deltaMs: number): void {
    let remainingDistance = (vehicle.speed / 3600) * (deltaMs / 1000);

    while (remainingDistance > 0) {
      const edgeRemaining =
        (1 - vehicle.progress) * vehicle.currentEdge.distance;
      if (remainingDistance >= edgeRemaining) {
        vehicle.progress = 1;
        remainingDistance -= edgeRemaining;

        vehicle.position = utils.interpolatePosition(
          vehicle.currentEdge.start.coordinates,
          vehicle.currentEdge.end.coordinates,
          vehicle.progress
        );
        vehicle.bearing = vehicle.currentEdge.bearing;

        const nextEdge = this.getNextEdge(vehicle);
        vehicle.currentEdge = nextEdge;
        vehicle.progress = 0;
      } else {
        vehicle.progress += remainingDistance / vehicle.currentEdge.distance;
        remainingDistance = 0;

        vehicle.position = utils.interpolatePosition(
          vehicle.currentEdge.start.coordinates,
          vehicle.currentEdge.end.coordinates,
          vehicle.progress
        );
        vehicle.bearing = vehicle.currentEdge.bearing;
      }
    }
  }

  /**
   * Route-based movement update.
   */
  private updatePositionOnRoute(
    vehicle: Vehicle,
    route: Route,
    deltaMs: number
  ): void {
    let remainingDistance = (vehicle.speed / 3600) * (deltaMs / 1000);

    while (remainingDistance > 0) {
      const edgeRemaining =
        (1 - vehicle.progress) * vehicle.currentEdge.distance;
      if (remainingDistance >= edgeRemaining) {
        vehicle.progress = 1;
        remainingDistance -= edgeRemaining;

        vehicle.position = utils.interpolatePosition(
          vehicle.currentEdge.start.coordinates,
          vehicle.currentEdge.end.coordinates,
          vehicle.progress
        );
        vehicle.bearing = vehicle.currentEdge.bearing;

        const edgeIndex = route.edges.findIndex(
          (e) => e.id === vehicle.currentEdge.id
        );
        if (edgeIndex < route.edges.length - 1) {
          vehicle.currentEdge = route.edges[edgeIndex + 1];
          vehicle.progress = 0;
        } else {
          this.setRandomDestination(vehicle.id);
          return;
        }
      } else {
        vehicle.progress += remainingDistance / vehicle.currentEdge.distance;
        remainingDistance = 0;

        vehicle.position = utils.interpolatePosition(
          vehicle.currentEdge.start.coordinates,
          vehicle.currentEdge.end.coordinates,
          vehicle.progress
        );
        vehicle.bearing = vehicle.currentEdge.bearing;
      }
    }
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
