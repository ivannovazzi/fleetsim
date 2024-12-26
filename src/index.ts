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

app.post('/reset', (req, res) => {
  simulationController.reset();
  res.json({ status: 'reset' });
});

app.post('/direction', async (req, res) => {
  await simulationController.setDirections(req.body);
  res.json({ status: 'direction' });
});

app.post('/node', async (req, res) => {
  const { coordinates } = await network.findNearestNode([req.body.lat, req.body.lng]);    
  res.json({ status: 'node', coordinates });
});

app.get('/options', (req, res) => {
  res.json(vehicleManager.getOptions());
});

app.post('/options', async (req, res) => {
  await simulationController.setOptions(req.body);
  res.json({ status: 'options set' });
});

app.get("/roads", (req, res) => {
  res.json(network.getFeatures());
});

app.get("/routes", (req, res) => {
  res.json(vehicleManager.getRoutes());
});

app.get("/heatzones", (req, res) => {
  network.generateHeatedZones({
    count: 16,
    minRadius: 0.3,
    maxRadius: 2,
    minIntensity: 0.3,
    maxIntensity: 1
  });
  res.json(network.exportHeatZones());
});


// WebSocket server
const wss = new WebSocketServer({ port: 8080 });

wss.on('connection', (ws) => {
  console.log('Client connected');
  const routeHandler = (route: any) => {
    ws.send(JSON.stringify({ type: 'route', data: route }));
  }
  const optionsUpdateHandler = (options: any) => {
    ws.send(JSON.stringify({ type: 'options', data: options }));
  }  
  const vehicleUpdateHandler = (vehicle: any) => {
    ws.send(JSON.stringify({ type: 'vehicle', data: vehicle }));
  };
  const statusUpdateHandler = (data: any) => {
    ws.send(JSON.stringify({ type: 'status', data }));
  };
  
  vehicleManager.on('update', vehicleUpdateHandler);
  vehicleManager.on('route', routeHandler);
  vehicleManager.on('options', optionsUpdateHandler);
  simulationController.on('updateStatus', statusUpdateHandler);

  ws.on('close', () => {
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