import { GraphQLClient } from "graphql-request";
import { config } from "./config";

export default new GraphQLClient(
  config.apiUrl,
  {
    headers: {
      Authorization: `Bearer ${config.token}`,
    },
  }
);
