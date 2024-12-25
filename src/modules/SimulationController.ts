import { StartOptions, VehicleManager } from './VehicleManager';
import { SimulationStatus } from '../types';
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
    ids: string[],
    dest: [number, number]
  ): Promise<void> {
    for (const id of ids) {
      await this.vehicleManager.moveToDestination(id, dest);
    }
    await this.vehicleManager.startRoute(ids);
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