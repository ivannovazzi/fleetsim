import { VehicleStatus } from "../types";

const oneOfEnum = <T>(values: T[]) => 
  values[Math.floor(Math.random() * values.length)] as T;

const vehicles = new Array(70).fill(0).map((_, i) => ({
  id: i.toString(),
  name: `V${i}`,
  status: oneOfEnum(Object.values(VehicleStatus)),
  position: [-1, 36] as [number, number]
}));

export { vehicles };