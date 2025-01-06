import { DataVehicle } from "../types";
import { config } from "../utils/config";

export default class Adapter {

  private request(path: string, options: RequestInit) {
    return fetch(`${config.adapterURL}${path}`, options).then((res) => res.json());
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
