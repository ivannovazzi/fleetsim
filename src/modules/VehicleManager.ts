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

/**
 * Manages vehicle creation, movement, and routing.
 * Each vehicle updates on its own interval.
 * Location updates are sent independently on a separate timer.
 */
export class VehicleManager extends EventEmitter {
  private vehicles: Map<string, Vehicle> = new Map();
  private visitedEdges: Map<string, Set<string>> = new Map();
  private routes: Map<string, Route> = new Map();

  /**
   * Tracks individual vehicle's setIntervals for movement.
   */
  private vehicleIntervals: Map<string, NodeJS.Timeout> = new Map();

  /**
   * Global location-upload interval.
   */
  private locationInterval: NodeJS.Timeout | null = null;

  private options: StartOptions = {
    updateInterval: config.updateInterval,
    minSpeed: config.minSpeed,
    maxSpeed: config.maxSpeed,
    speedVariation: config.speedVariation,
    acceleration: config.acceleration,
    deceleration: config.deceleration,
    turnThreshold: config.turnThreshold,
    defaultVehicles: config.defaultVehicles,
    heatZoneSpeedFactor: config.heatZoneSpeedFactor,
    updateServer: config.updateServer,
  };

  constructor(private network: RoadNetwork) {
    super();
    this.init();
  }

  /**
   * Init: fetches initial vehicles and populates the map.
   */
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
      currentEdge: startEdge,
      position: startEdge.start.coordinates,
      speed: this.options.minSpeed,
      bearing: startEdge.bearing,
      progress: 0,
    });

    this.visitedEdges.set(id, new Set([startEdge.id]));
  }

  /**
   * Resets a vehicle to a random edge.
   */
  private resetVehicle(id: string): void {
    const vehicle = this.vehicles.get(id);
    if (!vehicle) return;

    const startEdge = this.network.getRandomEdge();
    vehicle.currentEdge = startEdge;
    vehicle.position = startEdge.start.coordinates;
    vehicle.speed = this.options.minSpeed;
    vehicle.bearing = startEdge.bearing;
    vehicle.progress = 0;

    this.visitedEdges.get(id)?.clear();
    this.visitedEdges.get(id)?.add(startEdge.id);
  }

  /**
   * Starts a movement interval for the specified vehicle with a given update interval.
   */
  public startVehicleMovement(vehicleId: string, intervalMs: number): void {
    if (this.vehicleIntervals.has(vehicleId)) {      
      clearInterval(this.vehicleIntervals.get(vehicleId)!);
    }
    this.vehicleIntervals.set(
      vehicleId,
      setInterval(() => this.updateSingle(vehicleId), intervalMs)
    );
  }

  /**
   * Stops a vehicle's movement interval.
   */
  public stopVehicleMovement(vehicleId: string): void {
    if (this.vehicleIntervals.has(vehicleId)) {
      clearInterval(this.vehicleIntervals.get(vehicleId)!);
      this.vehicleIntervals.delete(vehicleId);
    }
  }

  /**
   * Starts sending location updates on a separate timer.
   */
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

  /**
   * Stops sending location updates.
   */
  public stopLocationUpdates(): void {
    if (this.locationInterval) {
      clearInterval(this.locationInterval);
      this.locationInterval = null;
    }
  }

  /**
   * Sets new global simulation options at runtime.
   */
  public setOptions(options: Partial<StartOptions>): void {
    this.options = { ...this.options, ...options };
    this.emit("options", this.options);
  }

  /**
   * Gets the current simulation options.
   */
  public getOptions(): StartOptions {
    return this.options;
  }

  /**
   * Moves a single vehicle once.
   */
  private updateSingle(vehicleId: string): void {
    const vehicle = this.vehicles.get(vehicleId);
    if (!vehicle) return;

    this.updateVehicle(vehicle);
    const updatedVehicle = this.vehicles.get(vehicleId);
    this.emit("update", serializeVehicle(updatedVehicle!));
  }

  /**
   * Master update function for each vehicle (either random edges or route).
   */
  private updateVehicle(vehicle: Vehicle): void {
    const route = this.routes.get(vehicle.id);
        
    this.updateSpeed(vehicle);
    
    if (route && route.edges.length > 0) {
      this.updatePositionOnRoute(vehicle, route);
    } else {
      this.updatePosition(vehicle);
    }    
  }

  /**
   * Adjusts vehicle speed depending on route bearing or random path.
   */
  private updateSpeed(vehicle: Vehicle): void {
    const nextEdge = this.getNextEdge(vehicle);
    if (!nextEdge) {
      vehicle.speed = Math.max(
        this.options.minSpeed,
        vehicle.speed - this.options.deceleration
      );
      return;
    }
    
    const isInHeatZone = this.network.isPositionInHeatZone(vehicle.position);
    const speedFactor = isInHeatZone ? this.options.heatZoneSpeedFactor : 1;

    const bearingDiff = Math.abs(nextEdge.bearing - vehicle.bearing);
    if (bearingDiff > this.options.turnThreshold) {
      vehicle.speed = this.safeSpeed(
        vehicle.speed,
        this.options.deceleration,
        speedFactor
      );
    } else {
      vehicle.speed = this.safeSpeed(
        vehicle.speed,
        -this.options.acceleration,
        speedFactor
      );
    }
  }

  private safeSpeed(
    speed: number,
    increase: number,
    speedFactor: number
  ): number {
    const minSpeed = this.options.minSpeed;
    const maxSpeed = this.options.maxSpeed;
        
    const baseSpeed = Math.min(maxSpeed, Math.max(minSpeed, (speed - increase) * speedFactor));
        
    const variation = this.options.speedVariation;
    const randomFactor = 1 + (Math.random() * variation * 2 - variation);
        
    return Math.min(maxSpeed, Math.max(minSpeed, baseSpeed * randomFactor));
  }

  /**
   * Random or route-based edge selection.
   */
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
  private updatePosition(vehicle: Vehicle): void {
    const distanceToMove =
      (vehicle.speed * this.options.updateInterval) / (3600 * 1000);
    vehicle.progress += distanceToMove / vehicle.currentEdge.distance;

    if (vehicle.progress >= 1) {
      const nextEdge = this.getNextEdge(vehicle);
      vehicle.currentEdge = nextEdge;
      vehicle.progress = 0;
    }
    vehicle.position = utils.interpolatePosition(
      vehicle.currentEdge.start.coordinates,
      vehicle.currentEdge.end.coordinates,
      vehicle.progress
    );
    vehicle.bearing = vehicle.currentEdge.bearing;
  }

  /**
   * Route-based movement update.
   */
  private updatePositionOnRoute(vehicle: Vehicle, route: Route): void {
    const distanceToMove =
      (vehicle.speed * this.options.updateInterval) / (3600 * 1000);
    vehicle.progress += distanceToMove / vehicle.currentEdge.distance;

    if (vehicle.progress >= 1) {
      const idx = route.edges.findIndex((e) => e.id === vehicle.currentEdge.id);
      if (idx < route.edges.length - 1) {
        vehicle.currentEdge = route.edges[idx + 1];
        vehicle.progress = 0;
      } else {
        this.routes.delete(vehicle.id);
      }
    }
    vehicle.position = utils.interpolatePosition(
      vehicle.currentEdge.start.coordinates,
      vehicle.currentEdge.end.coordinates,
      vehicle.progress
    );
    vehicle.bearing = vehicle.currentEdge.bearing;
  }

  /**
   * Schedules a vehicle to drive a route to the given destination.
   */
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

  /**
   * Retrieves all vehicles as DTOs.
   */
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
