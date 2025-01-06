# FleetSim

Vehicle location simulator for fleet management systems. Simulates multiple vehicles moving along real road networks using OpenStreetMap data.

## Requirements

- Node.js >= 18
- Docker (optional)
- OpenStreetMap export file (.geojson)

## Installation

```bash
git clone https://github.com/yourusername/fleetsim.git
cd fleetsim
npm install
```

## Environment Setup
Copy the example environment file:

```bash
cp .env.example .env
```

Required variables:

```bash
ADAPTER_URL=http://your-adapter-url
GEOJSON_PATH=./export.geojson
```

## Docker Usage
Build and run with default settings:

```bash
docker build -t fleetsim .
docker run -d fleetsim
```

Override configuration:

```bash
docker run -p 3000:3000 -d 
docker run -e UPDATE_INTERVAL=5000 -e MAX_SPEED=80 -p 3000:3000 fleetsim
```

Using docker-compose:

```bash
docker-compose up
```

## Configuration Options

| Variable         | Description                             | Default |
| ---------------- | --------------------------------------- | ------- |
| MIN_SPEED        | Minimum vehicle speed (km/h)            | 20      |
| MAX_SPEED        | Maximum vehicle speed (km/h)            | 60      |
| ACCELERATION     | Speed increase rate (km/h/update)       | 5       |
| DECELERATION     | Speed decrease rate (km/h/update)       | 7       |
| TURN_THRESHOLD   | Angle to trigger turn behavior (degrees)| 30      |



## Development

Start in development mode:

```bash
npm run dev
```





