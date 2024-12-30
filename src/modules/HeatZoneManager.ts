import * as turf from '@turf/turf';
import crypto from 'crypto';
import { HeatZone, HeatZoneFeature } from '../types';

export class HeatZoneManager {
  private zones: HeatZone[] = [];

  constructor() {}

  public getZones(): HeatZone[] {
    return this.zones;
  }

  public generateHeatedZones(
    bounds: [[number, number], [number, number]],
    options: {
      count?: number;
      minRadius?: number;
      maxRadius?: number;
      minIntensity?: number;
      maxIntensity?: number;
    } = {}
  ): void {
    const {
      count = 5,
      minRadius = 0.5,
      maxRadius = 2,
      minIntensity = 0.3,
      maxIntensity = 1
    } = options;

    const heatZones: HeatZoneFeature[] = [];
    for (let i = 0; i < count; i++) {
      const center = this.getRandomPointInBounds(bounds);
      const radius = minRadius + Math.random() * (maxRadius - minRadius);
      const intensity = minIntensity + Math.random() * (maxIntensity - minIntensity);
      const vertices = this.generateIrregularPolygon(center, radius);
      
      heatZones.push({
        type: "Feature",
        properties: {
          id: crypto.randomUUID(),
          intensity,
          timestamp: new Date().toISOString(),
          radius
        },
        geometry: {
          type: "Polygon",
          coordinates: [vertices]
        }
      });
    }

    // Smooth polygons and convert to simpler HeatZone objects
    this.zones = this.smoothPolygons(heatZones).map(feature => ({
      polygon: feature.geometry.coordinates[0],
      intensity: feature.properties.intensity,
      timestamp: feature.properties.timestamp
    }));
  }

  public exportHeatedZonesAsPaths(): string[] {
    return this.zones.map(zone => this.polygonToPath(zone.polygon));
  }

  public isPositionInHeatZone(position: [number, number]): boolean {
    const point = turf.point([position[1], position[0]]);
    return this.zones.some(zone => {
      const poly = turf.polygon([zone.polygon]);
      return turf.booleanPointInPolygon(point, poly);
    });
  }

  private getRandomPointInBounds(bounds: [[number, number], [number, number]]): [number, number] {
    const [[minLat, minLon], [maxLat, maxLon]] = bounds;
    return [
      minLat + Math.random() * (maxLat - minLat),
      minLon + Math.random() * (maxLon - minLon)
    ];
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
      const line = turf.lineString(zone.geometry.coordinates[0]);
      const smoothed = turf.bezierSpline(line);
      return {
        ...zone,
        geometry: {
          type: "Polygon",
          coordinates: [smoothed.geometry.coordinates]
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
}