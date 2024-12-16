import { gql } from "graphql-request";
import client from "./client";
import { Vehicle } from "./types";

const SEND_LOCATION_MUTATION = gql`
  mutation SendLocation(
    $latitude: Float!
    $longitude: Float!
    $vehicleId: UUID!
  ) {
    upsertVehicles(
      input: {
        vehicle: { id: $vehicleId, latitude: $latitude, longitude: $longitude }
      }
    ) {
      clientMutationId
    }
  }
`;

export async function sendLocation(lat: number, lon: number, id: string): Promise<void> {
  try {
    const variables = { latitude: lat, longitude: lon, vehicleId: id };

    const r = await client.request(SEND_LOCATION_MUTATION, variables);
  } catch (error) {
    console.error("Error sending location:", error);
  }
}

const GET_VEHICLES_QUERY = gql`
  query {
    vehicles {
      nodes {    
        id
        callsign
        isOnline
        _currentShift {
          id
        }
        _trackingType
        vehicleTypeRef {
          value
        }
      }
    }
  }
`;

export async function getVehicles(): Promise<Vehicle[]> {
  try {
    const response = await client.request<{
      vehicles: { nodes: Vehicle[] };
    }>(GET_VEHICLES_QUERY);
    return response.vehicles.nodes;
  } catch (error) {
    console.error("Error getting vehicles:", error);
    return [];
  }
}
