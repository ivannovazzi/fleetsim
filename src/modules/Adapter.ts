import { DataVehicle } from "../types";
import { config } from "../utils/config";

export default class Adapter {

  private async request(path: string, options: RequestInit) {
    try {
      const response = await fetch(`${config.adapterURL}${path}`, options);
      const data = await response.json();
      return data;
    } catch (error) {
      console.error(`Error from adapter: ${error}`);
      return
    }
  }

  public get(): Promise<DataVehicle[]> {
    return this.request("/vehicles",{ method: "GET" });
  }

  public sync(data: any) {
    return this.request("/sync", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });
  }
}
