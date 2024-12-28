import { Edge, StartOptions, Vehicle, VehicleStatus } from "../types"; 
import { RoadNetwork } from "./RoadNetwork";
import * as utils from "../utils/helpers";

export class ManagedVehicle implements Vehicle {
  public id: string;
  public name: string;
  public status: VehicleStatus;
  public flags: { hasInternetConnectivity: boolean; hasEngineIssue: boolean; lowFuel: boolean; };
  public currentEdge: Edge;
  public position: [number, number];
  public speed: number;
  public bearing: number;
  public progress: number;

  constructor(
    id: string,
    name: string,
    status: VehicleStatus,
    flags: { hasInternetConnectivity: boolean; hasEngineIssue: boolean; lowFuel: boolean; },
    startingEdge: Edge,
    minSpeed: number
  ) {
    this.id = id;
    this.name = name;
    this.status = status;
    this.flags = flags;
    this.currentEdge = startingEdge;
    this.position = startingEdge.start.coordinates;
    this.speed = minSpeed;
    this.bearing = startingEdge.bearing;
    this.progress = 0;
  }

  
  public update(deltaMs: number, options: StartOptions, network: RoadNetwork): void {
    this.updateSpeed(deltaMs, options, network);
    this.updatePosition(deltaMs, network);
  }

  private updateSpeed(deltaMs: number, options: StartOptions, network: RoadNetwork): void {
    const isInHeatZone = network.isPositionInHeatZone(this.position);
    const speedFactor = isInHeatZone ? options.heatZoneSpeedFactor : 1;
    const nextEdge = this.getNextEdge(network);

    if (!nextEdge) {
      this.speed = Math.max(
        options.minSpeed,
        this.computeNewSpeed(this.speed, options.deceleration, deltaMs)
      );
      return;
    }

    const bearingDiff = Math.abs(nextEdge.bearing - this.bearing);
    if (bearingDiff > options.turnThreshold) {
      this.speed = this.safeSpeed(
        this.computeNewSpeed(this.speed, options.deceleration, deltaMs),
        speedFactor,
        options
      );
    } else {
      this.speed = this.safeSpeed(
        this.computeNewSpeed(this.speed, -options.acceleration, deltaMs),
        speedFactor,
        options
      );
    }
  }

  private updatePosition(deltaMs: number, network: RoadNetwork): void {
    // Speed (km/h) * time (ms) -> distance in km
    let remainingDistance = (this.speed / 3600) * (deltaMs / 1000);

    while (remainingDistance > 0) {
      // Distance left on current edge (in km)
      const edgeRemaining = (1 - this.progress) * this.currentEdge.distance;

      if (remainingDistance >= edgeRemaining) {
        // Travel to the end of this edge
        this.progress = 1;
        remainingDistance -= edgeRemaining;

        // Position and bearing exactly at edge end
        this.position = utils.interpolatePosition(
          this.currentEdge.start.coordinates,
          this.currentEdge.end.coordinates,
          this.progress
        );
        this.bearing = this.currentEdge.bearing;

        // Move to the next edge
        this.currentEdge = this.getNextEdge(network);
        this.progress = 0;
      } else {
        // Advance partially on current edge
        this.progress += remainingDistance / this.currentEdge.distance;
        remainingDistance = 0;

        this.position = utils.interpolatePosition(
          this.currentEdge.start.coordinates,
          this.currentEdge.end.coordinates,
          this.progress
        );
        this.bearing = this.currentEdge.bearing;
      }
    }
  }

  private computeNewSpeed(currentSpeed: number, accel: number, deltaMs: number): number {
    const deltaHours = deltaMs / 3600000;
    return currentSpeed + accel * deltaHours;
  }

  private safeSpeed(newSpeed: number, factor: number, options: StartOptions): number {
    let s = newSpeed * factor;
    s = Math.max(options.minSpeed, Math.min(options.maxSpeed, s));
    const variationFactor = 1 + (Math.random() * options.speedVariation * 2 - options.speedVariation);
    s *= variationFactor;
    return Math.max(options.minSpeed, Math.min(options.maxSpeed, s));
  }

  public getNextEdge(network: RoadNetwork): Edge {
    const possibleEdges = network.getConnectedEdges(this.currentEdge);
    if (!possibleEdges.length) {
      return {
        ...this.currentEdge,
        start: this.currentEdge.end,
        end: this.currentEdge.start,
        bearing: (this.currentEdge.bearing + 180) % 360
      };
    }
    return possibleEdges[Math.floor(Math.random() * possibleEdges.length)];
  }
}