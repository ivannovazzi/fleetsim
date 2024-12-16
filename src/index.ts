import fs from 'fs';
import { FeatureCollection, LineString } from 'geojson';
import { getVehicles, sendLocation } from './api';
import * as utils from './utils';
import { config } from './config';

// Simulation constants
const UPDATE_INTERVAL = config.updateInterval;
const MIN_SPEED = config.minSpeed;
const MAX_SPEED = config.maxSpeed;  
const ACCELERATION = config.acceleration;
const DECELERATION = config.deceleration;
const TURN_THRESHOLD = config.turnThreshold;

interface Node {
  id: string;
  coordinates: [number, number];
  connections: Edge[];
}

interface Edge {
  id: string;
  streetId: string;
  start: Node;
  end: Node;
  distance: number;
  bearing: number;
}

interface Vehicle {
  id: string;
  name: string;
  currentEdge: Edge;
  position: [number, number];
  speed: number;
  bearing: number;
  progress: number;
}

class RoadNetwork {
  private nodes: Map<string, Node> = new Map();
  private edges: Map<string, Edge> = new Map();

  constructor(geojsonPath: string) {
    const data = JSON.parse(fs.readFileSync(geojsonPath, 'utf8')) as FeatureCollection;
    this.buildNetwork(data);
  }

  private buildNetwork(data: FeatureCollection) {
    data.features.forEach(feature => {
      if (feature.geometry.type === 'LineString') {
        const streetId = feature.properties?.id || crypto.randomUUID();
        const coordinates = (feature.geometry as LineString).coordinates;

        for (let i = 0; i < coordinates.length - 1; i++) {
          const [lon1, lat1] = coordinates[i];
          const [lon2, lat2] = coordinates[i + 1];

          const node1 = this.getOrCreateNode(`${lat1},${lon1}`, [lat1, lon1]);
          const node2 = this.getOrCreateNode(`${lat2},${lon2}`, [lat2, lon2]);
          
          const edgeId = `${node1.id}-${node2.id}`;
          const edge = {
            id: edgeId,
            streetId,
            start: node1,
            end: node2,
            distance: utils.calculateDistance(node1.coordinates, node2.coordinates),
            bearing: utils.calculateBearing(node1.coordinates, node2.coordinates)
          };

          this.edges.set(edgeId, edge);
          node1.connections.push(edge);
          node2.connections.push({
            ...edge,
            id: `${node2.id}-${node1.id}`,
            start: node2,
            end: node1,
            bearing: (edge.bearing + 180) % 360
          });
        }
      }
    });
  }

  private getOrCreateNode(id: string, coordinates: [number, number]): Node {
    if (!this.nodes.has(id)) {
      this.nodes.set(id, {
        id,
        coordinates,
        connections: []
      });
    }
    return this.nodes.get(id)!;
  }

  getRandomEdge(): Edge {
    const edges = Array.from(this.edges.values());
    return edges[Math.floor(Math.random() * edges.length)];
  }

  getConnectedEdges(edge: Edge): Edge[] {
    return edge.end.connections.filter(e => e.end.id !== edge.start.id);
  }
}

class VehicleManager {
  private vehicles: Map<string, Vehicle> = new Map();
  private network: RoadNetwork;
  private visitedEdges: Map<string, Set<string>> = new Map(); // vehicleId -> edges
  private lastUpdateTimes: Map<string, number> = new Map();
  private readonly stuckTimeout: number = 30000;

  constructor(network: RoadNetwork) {
    this.network = network;    
  }

  private addVehicle(id: string, name: string): string {
    const startEdge = this.network.getRandomEdge();
    
    const vehicle: Vehicle = {
      id,
      name,
      currentEdge: startEdge,
      position: startEdge.start.coordinates,
      speed: MIN_SPEED,
      bearing: startEdge.bearing,
      progress: 0
    };

    this.vehicles.set(id, vehicle);
    this.visitedEdges.set(id, new Set([startEdge.id]));
    this.lastUpdateTimes.set(id, Date.now());
    
    return id;
  }

  private resetVehicle(id: string) {
    const startEdge = this.network.getRandomEdge();
    const vehicle = this.vehicles.get(id)!;
    
    vehicle.currentEdge = startEdge;
    vehicle.position = startEdge.start.coordinates;
    vehicle.speed = MIN_SPEED;
    vehicle.bearing = startEdge.bearing;
    vehicle.progress = 0;
    
    this.visitedEdges.get(id)?.clear();
    this.visitedEdges.get(id)?.add(startEdge.id);
    this.lastUpdateTimes.set(id, Date.now());
  }

  async start(numVehicles: number = 10) {
    const vehicles = await getVehicles();
    const medical = vehicles.filter(utils.isMedical);

    // split vehicles by status: onshift, online, offline, untracked
    const onShift = medical.filter(utils.isOnShift);
    const online = medical.filter(utils.isOnline);
    const offline = medical.filter(utils.isOffline);
    const untracked = medical.filter(utils.isUntracked);

    // add all onshift, add all online, all some offline
    for (const vehicle of onShift) {
      this.addVehicle(vehicle.id, vehicle.callsign);
    }
    for (const vehicle of online) {
      this.addVehicle(vehicle.id, vehicle.callsign);
    }
    for (let i = 0; i < numVehicles - online.length; i++) {
      this.addVehicle(offline[i].id, offline[i].callsign);
    }
    for (let i = 0; i < 10; i++) {
      this.addVehicle(untracked[i].id, untracked[i].callsign);
    }

    utils.logVehicleStatuses(vehicles);

    setInterval(() => this.updateAll(), UPDATE_INTERVAL);
  }

  private async updateAll() {
    for (const [id, vehicle] of this.vehicles.entries()) {
      const now = Date.now();
      const lastUpdate = this.lastUpdateTimes.get(id)!;
      
      if (now - lastUpdate > this.stuckTimeout) {
        console.log(`Vehicle ${id} appears stuck - resetting...`);
        this.resetVehicle(id);
        continue;
      }

      this.updateVehicle(id, vehicle);
      this.lastUpdateTimes.set(id, now);

      await sendLocation(vehicle.position[0], vehicle.position[1], vehicle.id);
      console.log(
        `Vehicle ${vehicle.name}: Position: ${vehicle.position}, ` +
        `Speed: ${vehicle.speed.toFixed(1)} km/h, ` +
        `Visited edges: ${this.visitedEdges.get(id)?.size}`
      );
    }
  }

  private updateVehicle(id: string, vehicle: Vehicle) {
    this.updateSpeed(vehicle);
    this.updatePosition(vehicle);
  }

  private updateSpeed(vehicle: Vehicle) {
    const nextEdge = this.getNextEdge(vehicle);
    if (!nextEdge) {
      // Dead end - slow down
      vehicle.speed = Math.max(MIN_SPEED, vehicle.speed - DECELERATION);
      return;
    }

    const bearingDiff = Math.abs(nextEdge.bearing - vehicle.bearing);
    if (bearingDiff > TURN_THRESHOLD) {
      vehicle.speed = Math.max(MIN_SPEED, vehicle.speed - DECELERATION);
    } else {
      vehicle.speed = Math.min(MAX_SPEED, vehicle.speed + ACCELERATION);
    }
  }

  private getNextEdge(vehicle: Vehicle): Edge {
    const currentEdge = vehicle.currentEdge;
    const possibleEdges = this.network.getConnectedEdges(currentEdge);

    // No connected edges - make U-turn
    if (possibleEdges.length === 0) {
      return {
        ...currentEdge,
        start: currentEdge.end,
        end: currentEdge.start,
        bearing: (currentEdge.bearing + 180) % 360
      };
    }

    // Prefer unvisited edges
    const unvisitedEdges = possibleEdges.filter(e => !this.visitedEdges.get(vehicle.id)?.has(e.id));
    if (unvisitedEdges.length > 0) {
      const nextEdge = unvisitedEdges[Math.floor(Math.random() * unvisitedEdges.length)];
      this.visitedEdges.get(vehicle.id)?.add(nextEdge.id);
      return nextEdge;
    }

    // All edges visited - pick random
    return possibleEdges[Math.floor(Math.random() * possibleEdges.length)];
  }

  private updatePosition(vehicle: Vehicle) {
    const distanceToMove = (vehicle.speed * UPDATE_INTERVAL) / (3600 * 1000);
    vehicle.progress += distanceToMove / vehicle.currentEdge.distance;

    if (vehicle.progress >= 1) {
      const nextEdge = this.getNextEdge(vehicle);
      if (!nextEdge) {
        // Reset to start of current edge if dead end
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
}

// Start simulation
const network = new RoadNetwork(config.geojsonPath);
const vehicleManager = new VehicleManager(network);
vehicleManager.start(config.defaultVehicles);

