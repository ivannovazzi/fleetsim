import fs from 'fs';
import crypto from 'crypto';
import { Feature, FeatureCollection, LineString } from 'geojson';
import { Node, Edge, Route, PathNode, HeatZoneFeature } from '../types';
import * as utils from '../utils/helpers';
import { HeatZoneManager } from './HeatZoneManager';
import EventEmitter from 'events';


type Street = [number, number][];
interface Road {
  name: string;
  nodeIds: Set<string>;
  streets: Street[];
}

export class RoadNetwork extends EventEmitter {
  private nodes: Map<string, Node> = new Map();
  private edges: Map<string, Edge & { name?: string }> = new Map();
  private roads: Map<string, Road> = new Map();
  private data: FeatureCollection;
  private heatZoneManager: HeatZoneManager = new HeatZoneManager();

  constructor(geojsonPath: string) {
    super();
    this.data = JSON.parse(fs.readFileSync(geojsonPath, 'utf8')) as FeatureCollection;
    this.buildNetwork(this.data);    
  }

  public getAllRoads(): Road[] {
    return Array.from(this.roads.values());
  }

  private getAllNodes(): Node[] {
    return Array.from(this.nodes.values());
  }

  /**
   * Builds the network of nodes & edges; also reads the 'name' from feature properties.
   */
  private buildNetwork(data: FeatureCollection): void {
    data.features.forEach(feature => {
      if (feature.geometry.type === 'LineString') {
        const streetId = feature.properties?.id || crypto.randomUUID();
        const streetName = feature.properties?.name || "";
        const coords = (feature.geometry as LineString).coordinates;

        // Initialize or get existing road
        if (!this.roads.has(streetName)) {
          this.roads.set(streetName, {
            name: streetName,
            nodeIds: new Set<string>(),
            streets: [],
          });
        }
        const road = this.roads.get(streetName)!;

        road.streets.push(coords as Street);
        // Build edges
        for (let i = 0; i < coords.length - 1; i++) {
          const [lon1, lat1] = coords[i];
          const [lon2, lat2] = coords[i + 1];

          const node1 = this.getOrCreateNode(`${lat1},${lon1}`, [lat1, lon1]);
          const node2 = this.getOrCreateNode(`${lat2},${lon2}`, [lat2, lon2]);

          road.nodeIds.add(node1.id);
          road.nodeIds.add(node2.id);

          const distance = utils.calculateDistance(node1.coordinates, node2.coordinates);
          const bearing = utils.calculateBearing(node1.coordinates, node2.coordinates);
          
          const forwardEdge: Edge = {
            id: `${node1.id}-${node2.id}`,
            streetId,
            start: node1,
            end: node2,
            distance,
            bearing,
            name: streetName
          };
          
          const reverseEdge: Edge = {
            id: `${node2.id}-${node1.id}`,
            streetId,
            start: node2,
            end: node1,
            distance,
            bearing: (bearing + 180) % 360,
            name: streetName
          };
          
          this.edges.set(forwardEdge.id, forwardEdge);
          this.edges.set(reverseEdge.id, reverseEdge);
          
          node1.connections.push(forwardEdge);
          node2.connections.push(reverseEdge);          
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

  public getRandomEdge(): Edge {
    const edges = Array.from(this.edges.values());
    return edges[Math.floor(Math.random() * edges.length)];
  }

  public getRandomNode(): Node {
    const nodes = Array.from(this.nodes.values());
    return nodes[Math.floor(Math.random() * nodes.length)];
  }

  public findNearestNode(position: [number, number]): Node {
    let nearest: Node | null = null;
    let minDistance = Infinity;

    const nodes = this.getAllNodes();
    if (nodes.length === 0) {
      throw new Error('Network has no nodes');
    }

    for (const node of nodes) {
      const distance = utils.calculateDistance(position, node.coordinates);
      if (distance < minDistance) {
        minDistance = distance;
        nearest = node;
      }
    }
    if (!nearest) {
      throw new Error('Could not find nearest node');
    }
    return nearest;
  }

  /**
   * Returns edges connected at the end node of the provided edge, excluding any that lead back to the start node.
   */
  public getConnectedEdges(edge: Edge): Edge[] {
    return edge.end.connections.filter(e => e.end.id !== edge.start.id);
  }
  
  public findRoute(start: Node, end: Node): Route | null {
    const openSet = new Map<string, PathNode>();
    const closedSet = new Set<string>();
    const cameFrom = new Map<string, {prevId: string; edge: Edge}>();
    
    const gScore = new Map<string, number>();
    const fScore = new Map<string, number>();
    
    gScore.set(start.id, 0);
    const initialH = this.calculateHeuristic(start, end);
    fScore.set(start.id, initialH);
    
    openSet.set(start.id, {
      id: start.id,
      gScore: 0,
      fScore: initialH
    });

    while (openSet.size > 0) {
      const current = this.getLowestFScore(openSet);
      
      if (current.id === end.id) {
        return this.reconstructPath(start.id, end.id, cameFrom);
      }

      openSet.delete(current.id);
      closedSet.add(current.id);

      const currentNode = this.nodes.get(current.id)!;
      
      for (const edge of currentNode.connections) {
        if (closedSet.has(edge.end.id)) continue;

        const currentCost = gScore.get(current.id)!;        
        const tentativeCost = currentCost + edge.distance;
        const existingCost = gScore.get(edge.end.id);
        
        if (!existingCost || tentativeCost < existingCost) {
          cameFrom.set(edge.end.id, { prevId: current.id, edge });
          gScore.set(edge.end.id, tentativeCost);
          
          const h = this.calculateHeuristic(edge.end, end);
          const f = tentativeCost + h;
          fScore.set(edge.end.id, f);

          openSet.set(edge.end.id, {
            id: edge.end.id,
            gScore: tentativeCost,
            fScore: f
          });
        }
      }
    }
    return null;
  }

  private reconstructPath(
    startId: string,
    endId: string,
    cameFrom: Map<string, {prevId: string; edge: Edge}>
  ): Route {
    const path: Edge[] = [];
    let currentId = endId;
    let totalDistance = 0;

    while (currentId !== startId) {
      const { prevId, edge } = cameFrom.get(currentId)!;
      path.unshift(edge);
      totalDistance += edge.distance;
      currentId = prevId;
    }

    return {
      edges: path,
      distance: totalDistance
    };
  }

  private calculateHeuristic(from: Node, to: Node): number {
    return utils.calculateDistance(from.coordinates, to.coordinates);
  }

  private getLowestFScore(openSet: Map<string, PathNode>): PathNode {
    let lowest: PathNode | null = null;
    for (const node of openSet.values()) {
      if (!lowest || node.fScore < lowest.fScore) {
        lowest = node;
      }
    }
    return lowest!;
  }

  /**
   * Allows searching edges by their 'name'. Returns an array of matching edges with IDs, names, and node details.
   */
  public searchByName(query: string): Array<{
    name: string;
    nodeIds: string[];
    coordinates: [number, number][];
  }> {
    const lowerQuery = query.toLowerCase();
    const results: Array<{
      name: string;
      nodeIds: string[];
      coordinates: [number, number][];
    }> = [];

    for (const [name, road] of this.roads) {
      if (name.toLowerCase().includes(lowerQuery)) {
        results.push({
          name: road.name,
          nodeIds: Array.from(road.nodeIds),
          coordinates: road.streets.flat()
        });
      }
    }

    return results;
  }

  public generateHeatedZones(options: {
    count?: number;
    minRadius?: number;
    maxRadius?: number;
    minIntensity?: number;
    maxIntensity?: number;
  } = {}): void {
    const bounds = this.getNetworkBounds();
    this.heatZoneManager.generateHeatedZones(bounds, options);
    this.emit('heatzones', this.exportHeatZones());
  }

  public exportHeatZones(): HeatZoneFeature[] {
    return this.heatZoneManager.exportHeatedZonesAsFeatures();
  }

  private getNetworkBounds(): [[number, number], [number, number]] {
    const nodes = this.getAllNodes();
    let minLat = Infinity, maxLat = -Infinity;
    let minLon = Infinity, maxLon = -Infinity;

    nodes.forEach(node => {
      const [lat, lon] = node.coordinates;
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
      minLon = Math.min(minLon, lon);
      maxLon = Math.max(maxLon, lon);
    });

    return [[minLat, minLon], [maxLat, maxLon]];
  }

  public isPositionInHeatZone(position: [number, number]): boolean {
    return this.heatZoneManager.isPositionInHeatZone(position);    
  }
  
  public getFeatures(): FeatureCollection {
    return this.data;
  }
}