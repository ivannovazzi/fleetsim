import { VehicleManager } from './VehicleManager';
import { DirectionRequest, SimulationStatus, StartOptions } from '../types';
import EventEmitter from 'events';

export class SimulationController extends EventEmitter {
  constructor(private vehicleManager: VehicleManager) {
    super();
  }

  getStatus(): SimulationStatus {
    return {
      interval: this.vehicleManager.getInterval(),
      running: this.vehicleManager.isRunning(),
      vehicleCount: this.vehicleManager.getVehicleCount(),
      vehicles: this.vehicleManager.getVehicles()
    };
  }

  async start(options: StartOptions): Promise<void> {
    await this.vehicleManager.start(options);
    this.emit('updateStatus', this.getStatus());    
  }

  async startDirection(
    requests: DirectionRequest[]
  ): Promise<void> {
    for (const request of requests) {
      const { id, lat, lng } = request;
      await this.vehicleManager.moveToDestination(id, [lat, lng]);
    }
    await this.vehicleManager.startRoute(requests.map((r) => r.id));
    this.emit('updateStatus', this.getStatus());
  }  


  stop(): void {
    this.vehicleManager.stop();
    this.emit('updateStatus', this.getStatus());
  }

  async reset(): Promise<void> {
    await this.vehicleManager.reset();
    this.emit('updateStatus', this.getStatus());
  }

  async setOptions(options: StartOptions): Promise<void> {
    await this.vehicleManager.setOptions(options);
    this.emit('setStatus', this.getStatus());
  }

  async getOptions(): Promise<StartOptions> {
    return this.vehicleManager.getOptions();
  }
}