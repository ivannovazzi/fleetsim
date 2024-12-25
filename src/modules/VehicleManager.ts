import { Vehicle, Edge, VehicleDTO, Route, Node, ApiVehicleModel } from '../types';
import { RoadNetwork } from './RoadNetwork';
import { getVehicles, sendLocation } from '../utils/api';
import * as utils from '../utils/helpers';
import { config } from '../utils/config';
import { EventEmitter } from 'events';
import { serializeVehicle } from '../utils/serializer';

export interface StartOptions {
  updateInterval: number;
  minSpeed: number;
  maxSpeed: number;
  acceleration: number;
  deceleration: number;
  turnThreshold: number;
  defaultVehicles: number;
  updateServer: boolean;
}

export class VehicleManager extends EventEmitter {
  private vehicles: Map<string, Vehicle> = new Map();
  private visitedEdges: Map<string, Set<string>> = new Map(); // vehicleId -> edges
  private lastUpdateTimes: Map<string, number> = new Map();
  private readonly stuckTimeout = 30000;
  private interval: NodeJS.Timeout | null = null;
  private options: StartOptions = {
    updateInterval: config.updateInterval,
    minSpeed: config.minSpeed,
    maxSpeed: config.maxSpeed,
    acceleration: config.acceleration,
    deceleration: config.deceleration,
    turnThreshold: config.turnThreshold,
    defaultVehicles: config.defaultVehicles,
    updateServer: config.updateServer,
  }
  private routes: Map<string, Route> = new Map();

  constructor(private network: RoadNetwork) {
    super();
    this.init();
  }

  private async init() {
    const vehiclesData = await getVehicles();
    const medical = vehiclesData.filter(utils.isMedical);

    const onShift = medical.filter(utils.isOnShift);
    const online = medical.filter(utils.isOnline);
    const offline = medical.filter(utils.isOffline);
    const untracked = medical.filter(utils.isUntracked);

    const ordered = [
      ...onShift,
      ...online,
      ...offline,
      ...untracked
    ]

    for (const vehicle of ordered) {
      this.addVehicle(vehicle.id, vehicle.callsign, utils.getStatus(vehicle));
    }
  }
  private addVehicle(id: string, name: string, status: string): void {
    const startEdge = this.network.getRandomEdge();

    const vehicle: Vehicle = {
      id,
      name,
      status,
      currentEdge: startEdge,
      position: startEdge.start.coordinates,
      speed: this.options.minSpeed,
      bearing: startEdge.bearing,
      progress: 0
    };

    this.vehicles.set(id, vehicle);
    this.visitedEdges.set(id, new Set([startEdge.id]));
    this.lastUpdateTimes.set(id, Date.now());
  }

  private resetVehicle(id: string): void {
    const startEdge = this.network.getRandomEdge();
    const vehicle = this.vehicles.get(id)!;

    vehicle.currentEdge = startEdge;
    vehicle.position = startEdge.start.coordinates;
    vehicle.speed = this.options.minSpeed;
    vehicle.bearing = startEdge.bearing;
    vehicle.progress = 0;

    this.visitedEdges.get(id)?.clear();
    this.visitedEdges.get(id)?.add(startEdge.id);
    this.lastUpdateTimes.set(id, Date.now());
  }

  public async start(options: StartOptions): Promise<void> {
    if (this.interval) {
      return;
    }
    this.options = options;    

    // get the ids of the this.options.defaultVehicles first vehicles
    const vehicleIds = Array.from(this.vehicles.keys()).slice(0, this.options.defaultVehicles);
    this.interval = setInterval(() => this.updateAll(vehicleIds), this.options.updateInterval);
  }
  public async startRoute(ids: string[]): Promise<void> {
    console.log('Starting route for vehicles:', ids);
    this.interval = setInterval(() => this.updateAll(ids), this.options.updateInterval);
  }

  public stop(): void {
    clearInterval(this.interval!);
    this.interval = null;
    this.lastUpdateTimes.clear();    
  }

  public async reset(): Promise<void> {
    this.vehicles.clear();
    this.visitedEdges.clear();
    this.lastUpdateTimes.clear();
    this.routes.clear();
    clearInterval(this.interval!);
    this.interval = null;
    await this.init();
  }

  public setOptions(options: StartOptions): void {
    this.options = options;
    this.emit('options', this.options);
  }

  public getOptions(): StartOptions {
    return this.options;
  }

  private async updateAll(vehicleIds: string[]): Promise<void> {
    for (const id of vehicleIds) {
      const vehicle = this.vehicles.get(id);
      if (!vehicle) {
        console.error(`Vehicle ${id} not found`);
        continue;
      }
      const now = Date.now();
      const lastUpdate = this.lastUpdateTimes.get(id)!;

      if (now - lastUpdate > this.stuckTimeout) {
        console.log(`Vehicle ${vehicle.name} appears stuck - resetting...`);
        this.resetVehicle(id);
        continue;
      }

      this.updateVehicle(vehicle);
      this.lastUpdateTimes.set(id, now);      
    }
    const vehicles = Array.from(this.vehicles.values());
    if (this.options.updateServer) {
      await sendLocation(vehicles.map(v => ({ latitude: v.position[0], longitude: v.position[1], id: v.id,
        positionReceivedAt: new Date().toISOString(),
        positionOriginRefId: 'b13c099c-ab20-11ea-8f69-0673f8c18e22',
      })));
    }

    this.emit('update', this.getVehicles());
  }

  private updateVehicle(vehicle: Vehicle): void {
    const route = this.routes.get(vehicle.id);
    if (route && route.edges.length > 0) {
      this.updateSpeed(vehicle);
      this.updatePositionOnRoute(vehicle, route);
    } else {
      this.updateSpeed(vehicle);
      this.updatePosition(vehicle);
    }
  }

  private updateSpeed(vehicle: Vehicle): void {
    const nextEdge = this.getNextEdge(vehicle);
    if (!nextEdge) {
      vehicle.speed = Math.max(this.options.minSpeed, vehicle.speed - this.options.deceleration);
      return;
    }

    const bearingDiff = Math.abs(nextEdge.bearing - vehicle.bearing);
    if (bearingDiff > this.options.turnThreshold) {
      vehicle.speed = Math.max(this.options.minSpeed, vehicle.speed - this.options.deceleration);
    } else {
      vehicle.speed = Math.min(this.options.maxSpeed, vehicle.speed + this.options.acceleration);
    }
  }

  private getNextEdge(vehicle: Vehicle): Edge {
    const currentEdge = vehicle.currentEdge;
    const possibleEdges = this.network.getConnectedEdges(currentEdge);

    if (possibleEdges.length === 0) {
      return {
        ...currentEdge,
        start: currentEdge.end,
        end: currentEdge.start,
        bearing: (currentEdge.bearing + 180) % 360
      };
    }

    const unvisitedEdges = possibleEdges.filter(
      e => !this.visitedEdges.get(vehicle.id)?.has(e.id)
    );
    if (unvisitedEdges.length > 0) {
      const nextEdge = unvisitedEdges[Math.floor(Math.random() * unvisitedEdges.length)];
      this.visitedEdges.get(vehicle.id)?.add(nextEdge.id);
      return nextEdge;
    }

    return possibleEdges[Math.floor(Math.random() * possibleEdges.length)];
  }

  private updatePosition(vehicle: Vehicle): void {
    const distanceToMove = (vehicle.speed * this.options.updateInterval) / (3600 * 1000);
    vehicle.progress += distanceToMove / vehicle.currentEdge.distance;

    if (vehicle.progress >= 1) {
      const nextEdge = this.getNextEdge(vehicle);
      if (!nextEdge) {
        vehicle.progress = 0;
        return;
      }

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

  private updatePositionOnRoute(vehicle: Vehicle, route: Route): void {
    const distanceToMove = (vehicle.speed * this.options.updateInterval) / (3600 * 1000);
    vehicle.progress += distanceToMove / vehicle.currentEdge.distance;

    if (vehicle.progress >= 1) {
      const currentIndex = route.edges.findIndex(e => e.id === vehicle.currentEdge.id);
      if (currentIndex < route.edges.length - 1) {
        vehicle.currentEdge = route.edges[currentIndex + 1];
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

  public async moveToDestination(vehicleId: string, destination: [number, number]): Promise<void> {
    const vehicle = this.vehicles.get(vehicleId);
    if (!vehicle) throw new Error(`Vehicle ${vehicleId} not found`);

    const endNode = this.network.findNearestNode(destination);
    const startNode = this.network.findNearestNode(vehicle.position);
    this.emit('route', { 
      from: startNode.coordinates,
      to: endNode.coordinates,
     });
    
    // Verify nodes have connections
    if (startNode.connections.length === 0) {
      throw new Error(`Start node ${startNode.id} has no connections`);
    }
    if (endNode.connections.length === 0) {
      throw new Error(`End node ${endNode.id} has no connections`);
    }

    const route = this.network.findRoute(startNode, endNode);    
    
    if (!route) {
      console.error('Failed to find route:', {
        startNodeId: startNode.id,
        endNodeId: endNode.id,
        startConnections: startNode.connections.length,
        endConnections: endNode.connections.length
      });
      return;
    }

    console.log('Route found:', {
      numEdges: route.edges.length,
      totalDistance: route.distance
    });

    this.routes.set(vehicleId, route);
    vehicle.currentEdge = route.edges[0];
    vehicle.progress = 0;
  }

  public isRunning(): boolean {
    return this.interval !== null;
  }

  public getVehicleCount(): number {
    return this.vehicles.size;
  }

  public getInterval(): number {
    return this.options.updateInterval;
  }

  public getVehicles(): VehicleDTO[] {
    return Array.from(this.vehicles.values()).map(serializeVehicle);
  }  
}