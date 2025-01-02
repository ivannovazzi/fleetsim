import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import { RoadNetwork } from './modules/RoadNetwork';
import { VehicleManager } from './modules/VehicleManager';
import { SimulationController } from './modules/SimulationController';
import { config, verifyConfig } from './utils/config';
import bodyParser from 'body-parser';

verifyConfig();

const app = express();
app.use(cors());
app.use(express.json());
app.use(bodyParser.json());

const network = new RoadNetwork(config.geojsonPath);
const vehicleManager = new VehicleManager(network);
const simulationController = new SimulationController(vehicleManager);

app.get('/status', (req, res) => {
  res.json(simulationController.getStatus());
});

app.post('/start', async (req, res) => {
  await simulationController.start(req.body);
  res.json({ status: 'started' });
});

app.post('/stop', (req, res) => {
  simulationController.stop();
  res.json({ status: 'stopped' });
});

app.post('/direction', async (req, res) => {
  await simulationController.setDirections(req.body);
  res.json({ status: 'direction' });
});

app.post('/node', async (req, res) => {
  const { coordinates } = await network.findNearestNode([req.body[1], req.body[0]]);    
  res.json([coordinates[1], coordinates[0]]);
});

app.post('/find-road', async (req, res) => {
  const road = await network.findNearestRoad([req.body[1], req.body[0]]);
  res.json(road);
});

app.get('/options', (req, res) => {
  res.json(vehicleManager.getOptions());
});

app.post('/options', async (req, res) => {
  await simulationController.setOptions(req.body);
  res.json({ status: 'options set' });
});

app.get("/network", (req, res) => {
  res.json(network.getFeatures());
});

app.get("/roads", (req, res) => {
  res.json(network.getAllRoads());
});

app.get("/routes", (req, res) => {
  res.json(vehicleManager.getRoutes());
});

app.post("/search", async (req, res) => {
  const results = await network.searchByName(req.body.query);
  res.json(results);
});

app.post("/heatzones", (req, res) => {
  network.generateHeatedZones({
    count: 16,
    minRadius: 0.3,
    maxRadius: 1,
    minIntensity: 0.3,
    maxIntensity: 1
  });
  res.json({ status: 'heatzones generated' });
});

app.get("/heatzones", (req, res) => {
  res.json(network.exportHeatZones());
});


// WebSocket server
const wss = new WebSocketServer({ port: 8080 });

wss.on('connection', (ws) => {
  console.log('Client connected');

  const heatzonesHandler = <T>(heatzones: T) => {
    ws.send(JSON.stringify({ type: 'heatzones', data: heatzones }));
  }
  const routeHandler = <T>(route: T) => {
    ws.send(JSON.stringify({ type: 'route', data: route }));
  }
  const optionsUpdateHandler = <T>(options: T) => {
    ws.send(JSON.stringify({ type: 'options', data: options }));
  }  
  const vehicleUpdateHandler = <T>(vehicle: T) => {
    ws.send(JSON.stringify({ type: 'vehicle', data: vehicle }));
  };
  const statusUpdateHandler = <T>(data: T) => {
    ws.send(JSON.stringify({ type: 'status', data }));
  };
  
  network.on('heatzones', heatzonesHandler);
  vehicleManager.on('update', vehicleUpdateHandler);
  vehicleManager.on('route', routeHandler);
  vehicleManager.on('options', optionsUpdateHandler);
  simulationController.on('updateStatus', statusUpdateHandler);

  ws.on('close', () => {

    network.removeListener('heatzones', heatzonesHandler);
    vehicleManager.removeListener('route', routeHandler);
    vehicleManager.removeListener('update', vehicleUpdateHandler);
    vehicleManager.removeListener('options', optionsUpdateHandler);
    simulationController.removeListener('updateStatus', statusUpdateHandler);
    console.log('Client disconnected');
  });
});

// Start HTTP server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});