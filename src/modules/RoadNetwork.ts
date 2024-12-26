import fs from 'fs';
import { FeatureCollection, LineString } from 'geojson';
import { Node, Edge, Route, PathNode } from '../types';
import * as utils from '../utils/helpers';
import { HeatZoneManager } from './HeatZoneManager';

export interface HeatZoneProperties {
  id: string;
  intensity: number;
  timestamp: string;
  radius: number;
}

export interface HeatZoneFeature {
  type: "Feature";
  properties: HeatZoneProperties;
  geometry: {
    type: "Polygon";
    coordinates: number[][][];
  };
}

export interface PathCost {
  distance: number;
}

export class RoadNetwork {
  private nodes: Map<string, Node> = new Map();
  private edges: Map<string, Edge> = new Map();
  private data: FeatureCollection;  
  private heatPenaltyFactor = 1.5;
  private heatZoneManager: HeatZoneManager = new HeatZoneManager(this.heatPenaltyFactor);

  constructor(geojsonPath: string) {
    this.data = JSON.parse(fs.readFileSync(geojsonPath, 'utf8')) as FeatureCollection;
    this.buildNetwork(this.data);    
  }

  public getAllRoads(): Edge[] {
    return Array.from(this.edges.values());
  }

  public getAllNodes(): Node[] {
    return Array.from(this.nodes.values());
  }

  public getFeatures(): FeatureCollection {
    return this.data;
  }

  private buildNetwork(data: FeatureCollection): void {
    data.features.forEach(feature => {
      if (feature.geometry.type === 'LineString') {
        const streetId = feature.properties?.id || crypto.randomUUID();
        const coordinates = (feature.geometry as LineString).coordinates;

        for (let i = 0; i < coordinates.length - 1; i++) {
          const [lon1, lat1] = coordinates[i];
          const [lon2, lat2] = coordinates[i + 1];

          const node1 = this.getOrCreateNode(`${lat1},${lon1}`, [lat1, lon1]);
          const node2 = this.getOrCreateNode(`${lat2},${lon2}`, [lat2, lon2]);

          // Create forward edge
          const forwardEdge: Edge = {
            id: `${node1.id}-${node2.id}`,
            streetId,
            start: node1,
            end: node2,
            distance: utils.calculateDistance(node1.coordinates, node2.coordinates),
            bearing: utils.calculateBearing(node1.coordinates, node2.coordinates)
          };

          // Create reverse edge
          const reverseEdge: Edge = {
            id: `${node2.id}-${node1.id}`,
            streetId,
            start: node2,
            end: node1,
            distance: forwardEdge.distance,
            bearing: (forwardEdge.bearing + 180) % 360
          };

          // Add edges to collections
          this.edges.set(forwardEdge.id, forwardEdge);
          this.edges.set(reverseEdge.id, reverseEdge);

          // Add connections to nodes
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

  public getConnectedEdges(edge: Edge): Edge[] {
    return edge.end.connections.filter(e => e.end.id !== edge.start.id);
  }

  private bboxesIntersect(a: [number, number, number, number], b: [number, number, number, number]): boolean {
    // [minX, minY, maxX, maxY]
    return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
  }

  private calculateEdgeCost(edge: Edge): PathCost {
    return {
      distance: edge.distance
    };
  }

  public findRoute(start: Node, end: Node): Route | null {
    const openSet = new Map<string, PathNode>();
    const closedSet = new Set<string>();
    const cameFrom = new Map<string, {prevId: string; edge: Edge}>();
    
    const gScore = new Map<string, number>();
    const fScore = new Map<string, number>();

    // Initialize start node
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

        const edgeCost = this.calculateEdgeCost(edge);
        const currentCost = gScore.get(current.id)!;
        
        const tentativeCost = currentCost + edgeCost.distance;

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
  
  public generateHeatedZones(options: {
    count?: number;
    minRadius?: number;
    maxRadius?: number;
    minIntensity?: number;
    maxIntensity?: number;
  } = {}): void {
    const bounds = this.getNetworkBounds();
    this.heatZoneManager.generateHeatedZones(bounds, options);
  }

  /**
   * Exports heat zones as GeoJSON FeatureCollection
   */
  public exportHeatZones(): string[] {
    return this.heatZoneManager.exportHeatedZonesAsPaths();
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

  private getRandomPointInBounds(bounds: [[number, number], [number, number]]): [number, number] {
    const [[minLat, minLon], [maxLat, maxLon]] = bounds;
    return [
      minLat + Math.random() * (maxLat - minLat),
      minLon + Math.random() * (maxLon - minLon)
    ];
  }

  public isPositionInHeatZone(position: [number, number]): boolean {
    return this.heatZoneManager.isPositionInHeatZone(position);    
  }
}