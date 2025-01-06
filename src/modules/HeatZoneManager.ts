import * as turf from '@turf/turf';
import intersect from '@turf/intersect';
import crypto from 'crypto';
import { Edge, Node, HeatZone, HeatZoneFeature } from '../types';

export class HeatZoneManager {
  private zones: HeatZone[] = [];

  constructor() {}

  public getZones(): HeatZone[] {
    return this.zones;
  }

  public generateHeatedZones(
    edges: Edge[],
    nodes: Node[],
    options: {
      count?: number;
      minRadius?: number;
      maxRadius?: number;
      minIntensity?: number;
      maxIntensity?: number;
      maxAttempts?: number;     // maximum tries if region overlaps
    } = {}
  ): void {
    const {
      count = 5,
      minRadius = 0.1,
      maxRadius = 1,
      minIntensity = 0.2,
      maxIntensity = 1,
      maxAttempts = 10,
    } = options;

    const intersectionNodes = nodes.filter(n => n.connections.length >= 3);
    const pool = intersectionNodes.length ? intersectionNodes : nodes;
    const items = pool.map(n => ({
      node: n,
      weight: n.connections.length
    }));
    const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);

    const newZones: HeatZoneFeature[] = [];
    let attempts = 0;
    while (newZones.length < count && attempts < count * maxAttempts) {
      attempts++;
      const picked = this.pickNodeByWeight(items, totalWeight);
      const center: [number, number] = [picked.coordinates[0], picked.coordinates[1]];

      const radiusScale = Math.max(1, picked.connections.length / 2);
      const radius = (minRadius + Math.random() * (maxRadius - minRadius)) * radiusScale;
      const intensity = minIntensity + Math.random() * (maxIntensity - minIntensity);

      const vertices = this.generateIrregularPolygon(center, radius);
      const candidateZone: HeatZoneFeature = {
        type: 'Feature',
        properties: {
          id: crypto.randomUUID(),
          intensity,
          timestamp: new Date().toISOString(),
          radius
        },
        geometry: {
          type: 'Polygon',
          coordinates: vertices as [number, number][]
        }
      };

      newZones.push(candidateZone);
    }

    this.zones = this.smoothPolygons(newZones).map(zone => ({
      polygon: zone.geometry.coordinates,
      intensity: zone.properties.intensity,
      timestamp: zone.properties.timestamp
    }));
  }

  public exportHeatedZonesAsPaths(): string[] {
    return this.zones.map(zone => this.polygonToPath(zone.polygon));
  }

  public exportHeatedZonesAsFeatures(): HeatZoneFeature[] {
    return this.zones.map(zone => ({
      type: "Feature",
      properties: {
        id: crypto.randomUUID(),
        intensity: zone.intensity,
        timestamp: zone.timestamp,
        radius: 0
      },
      geometry: {
        type: "Polygon",
        coordinates: zone.polygon as [number, number][]
      }
    }));
  }

  public isPositionInHeatZone(position: [number, number]): boolean {
    const point = turf.point([position[1], position[0]]);
    return this.zones.some(zone => {
      const poly = turf.polygon([zone.polygon]);
      return turf.booleanPointInPolygon(point, poly);
    });
  }

  
  private generateIrregularPolygon(center: [number, number], radius: number): number[][] {
    const points = 12;
    const vertices: number[][] = [];
    for (let i = 0; i < points; i++) {
      const angle = (i / points) * 2 * Math.PI;
      const jitter = 0.7 + Math.random() * 0.6;
      const distance = radius * jitter;
      const point = turf.destination(
        turf.point([center[1], center[0]]),
        distance,
        (angle * 180) / Math.PI
      );
      vertices.push(point.geometry.coordinates);
    }
    vertices.push(vertices[0]);
    return vertices;
  }

  private smoothPolygons(zones: HeatZoneFeature[]): HeatZoneFeature[] {
    return zones.map(zone => {
      const line = turf.lineString(zone.geometry.coordinates);
      const smoothed = turf.bezierSpline(line);
      return {
        ...zone,
        geometry: {
          type: "Polygon",
          coordinates: smoothed.geometry.coordinates as [number, number][]
        }
      };
    });
  }

  private polygonToPath(polygon: number[][]): string {
    if (polygon.length === 0) return '';
    
    const encode = (current: number, previous: number) => {
      const coord = Math.round(current * 1e5);
      const prev = Math.round(previous * 1e5);
      const coord1 = coord - prev;
      let coord2 = (coord1 << 1) ^ (coord1 >> 31);
      let str = '';
      while (coord2 >= 0x20) {
        str += String.fromCharCode((0x20 | (coord2 & 0x1f)) + 63);
        coord2 >>= 5;
      }
      str += String.fromCharCode(coord2 + 63);
      return str;
    };

    let path = '';
    let prevLat = 0;
    let prevLng = 0;

    for (const [lng, lat] of polygon) {
      path += encode(lat, prevLat);
      path += encode(lng, prevLng);
      prevLat = lat;
      prevLng = lng;
    }
    return path;
  }

  // Choose a node at random weighted by connections
  private pickNodeByWeight(
    items: Array<{ node: Node; weight: number }>,
    totalWeight: number
  ): Node {
    let r = Math.random() * totalWeight;
    for (const item of items) {
      if (r < item.weight) return item.node;
      r -= item.weight;
    }
    // Fallback
    return items[items.length - 1].node;
  }  
}