import { VehicleManager } from './VehicleManager';
import { DirectionRequest, SimulationStatus, StartOptions, VehicleDTO } from '../types';
import EventEmitter from 'events';

type EventEmitterMap = {
  updateStatus: [SimulationStatus];
};

export class SimulationController extends EventEmitter<EventEmitterMap> {
  private autoHeatZoneInterval?: NodeJS.Timeout;

  constructor(private vehicleManager: VehicleManager) {
    super();
  }

  getStatus(): SimulationStatus {
    return {
      interval: this.vehicleManager.getOptions().updateInterval,
      running: this.vehicleManager.isRunning(),      
    };
  }

  public getInterval(): number {
    return this.vehicleManager.getOptions().updateInterval;
  }

  async reset(): Promise<void> {
    this.stop();
    this.vehicleManager.reset();
    this.emit('updateStatus', this.getStatus());
  }

  async start(options: Partial<StartOptions>): Promise<void> {
    this.vehicleManager.setOptions(options);

    const intervalMs = this.vehicleManager.getOptions().updateInterval;

    for (const v of this.vehicleManager.getVehicles()) {
      this.vehicleManager.startVehicleMovement(v.id, intervalMs);
    }

    if (this.vehicleManager.getOptions().syncAdapter) {
      const syncAdapterTimeout = this.vehicleManager.getOptions().syncAdapterTimeout;
      this.vehicleManager.startLocationUpdates(syncAdapterTimeout);
    }

    // Automatically regenerate heat zones every 5 minutes
    if (!this.autoHeatZoneInterval) {
      this.vehicleManager.getNetwork().generateHeatedZones();
      this.autoHeatZoneInterval = setInterval(() => {
        // Generate new heat zones
        this.vehicleManager.getNetwork().generateHeatedZones();
      }, 5 * 60 * 1000);
    }

    this.emit('updateStatus', this.getStatus());
  }

  async setDirections(requests: DirectionRequest[]): Promise<void> {
    for (const request of requests) {
      const { id, lat, lng } = request;
      await this.vehicleManager.findAndSetRoutes(id, [lat, lng]);
    }
  }

  public stop(): void {
    // Stop all vehicle updates
    for (const v of this.vehicleManager.getVehicles()) {
      this.vehicleManager.stopVehicleMovement(v.id);
    }
    // Stop location updates
    this.vehicleManager.stopLocationUpdates();
    this.emit('updateStatus', this.getStatus());
  }

  async setOptions(options: StartOptions): Promise<void> {
    if (this.vehicleManager.getOptions().useAdapter !== options.useAdapter) {
      this.stop();
      this.vehicleManager.reset();
    }
    await this.vehicleManager.setOptions(options);
    this.emit('updateStatus', this.getStatus());
  }

  async getOptions(): Promise<StartOptions> {
    return this.vehicleManager.getOptions();
  }

  async setUseAdapter(useAdapter: boolean): Promise<void> {    
    this.stop();
    await this.vehicleManager.setOptions({ useAdapter });
    await this.vehicleManager.reset();
    this.emit('updateStatus', this.getStatus());    
  }

  async getVehicles(): Promise<VehicleDTO[]> {
    return this.vehicleManager.getVehicles();
  }
}