import { VehicleManager } from './VehicleManager';
import { DirectionRequest, SimulationStatus, StartOptions } from '../types';
import EventEmitter from 'events';

export class SimulationController extends EventEmitter {
  constructor(private vehicleManager: VehicleManager) {
    super();
  }

  getStatus(): SimulationStatus {
    return {
      interval: this.vehicleManager.getOptions().updateInterval,
      running: this.vehicleManager.isRunning(),
      vehicles: this.vehicleManager.getVehicles()
    };
  }

  public getInterval(): number {
    return this.vehicleManager.getOptions().updateInterval;
  }

  async start(options: Partial<StartOptions>): Promise<void> {
    this.vehicleManager.setOptions(options);

    const intervalMs = this.vehicleManager.getOptions().updateInterval;

    for (const v of this.vehicleManager.getVehicles()) {
      this.vehicleManager.startVehicleMovement(v.id, intervalMs);
    }

    if (this.vehicleManager.getOptions().updateServer) {
      this.vehicleManager.startLocationUpdates(intervalMs);
    }

    this.emit('updateStatus', this.getStatus());    
  }

  async setDirections(
    requests: DirectionRequest[]
  ): Promise<void> {
    for (const request of requests) {
      const { id, lat, lng } = request;
      await this.vehicleManager.findAndSetRoutes(id, [lat, lng]);
    }
  }  


  public stop(): void {
    for (const v of this.vehicleManager.getVehicles()) {
      this.vehicleManager.stopVehicleMovement(v.id);
    }
    this.vehicleManager.stopLocationUpdates();
    this.emit('updateStatus', this.getStatus());
  }

  async setOptions(options: StartOptions): Promise<void> {
    await this.vehicleManager.setOptions(options);
    this.emit('updateStatus', this.getStatus());
  }

  async getOptions(): Promise<StartOptions> {
    return this.vehicleManager.getOptions();
  }
}