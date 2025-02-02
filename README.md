# Rare Bird Sightings Map

An interactive web application that displays notable ("rare") bird sightings on a map using data from eBird. Users can explore rare bird observations in different locations, search for specific areas, and view detailed information about bird sightings.

## Features

- Interactive map interface using React-Leaflet
- Location search functionality using OpenStreetMap's Nominatim service
- Real-time bird sighting data from eBird API
- Clustered markers for multiple bird sightings at the same location
- Detailed popup information for each sighting including:
  - Species common name
  - Observation date
  - Links to eBird checklists
- Automatic data updates when moving to new map areas
- Mobile-responsive design
- Express.js backend with eBird API integration
- Configurable search radius and time window for bird sightings

## Prerequisites

- Node.js (v14 or higher) (https://nodejs.org)
- A valid eBird API key (https://documenter.getpostman.com/view/664302/S1ENwy59)

## Installation

1. Clone the repository:
```bash
git clone https://github.com/tomaskom/rare-birds
cd rare-birds
```

2. Install dependencies for both server and client:
```bash
# Install server dependencies
npm install

# Install client dependencies
npm install client/
```

3. Create a `.env` file in the `rare-birds/server` directory and add your eBird API key:
```
EBIRD_API_KEY=your_api_key_here
PORT=3000  # Optional, defaults to 3000
```

4. Create a `.env` file in the `rare-birds/client` directory and add the API URL:
```
VITE_API_URL=http://localhost:3000
```

5. Start the server from rare-birds server folder:
```bash
cd server
node start
```
 
6. In a separate terminal, start the backend:
```bash
cd client
npm run dev
```

7. Navigate a browser window to `http://localhost:3000`

## Project Structure

```
├── client/                 # Frontend
│   ├── src/
│   │   ├── components/
│   │   │   └── BirdMap.jsx
│   │   └── ...
│   ├── .env                # Client environment variables
│   └── ...
├── server/                 # Backend
│   ├── server.js
│   ├── .env                # Server environment variables
│   └── ...
└── ...
```

## Server Implementation

The server.js server provides:

- Static file serving for the React application
- A proxy endpoint for eBird API requests
- CORS support for development
- Error handling and logging

### API Endpoints

#### GET /api/birds
Fetches notable bird sightings from eBird API.

Parameters:
- `lat` (required): Latitude of the search center
- `lng` (required): Longitude of the search center

Configuration:
- Search radius: 25km
- Time window: Last 7 days
- Maximum results: 100 sightings
- Includes confirmed notable species only

Example request:
```bash
GET /api/birds?lat=36.9741&lng=-122.0308
```

## Dependencies

### Frontend
- react
- react-leaflet
- leaflet
- lodash

### Backend
- express
- cors
- node-fetch
- dotenv

## Component Structure

- `BirdMap`: Main component that handles the map interface and data fetching
- `BirdMarker`: Optimized marker component for displaying bird sighting locations
- `BirdPopupContent`: Memoized component for displaying detailed sighting information
- `PopupInteractionHandler`: Handles map interactions when popups are open
- `MapEvents`: Manages map movement events

## API Integration

The application integrates with two external APIs:
1. eBird API (via backend proxy) for bird sighting data
2. OpenStreetMap's Nominatim API for location search

### Data Format

The application expects bird sighting data in the following format:

```javascript
{
  lat: number,
  lng: number,
  birds: [
    {
      comName: string,
      obsDt: string,
      obsValid: boolean,
      subIds: string[]
    }
  ]
}
```

## Performance Optimizations

- Memoized components to prevent unnecessary re-renders
- Clustered markers for locations with multiple sightings
- Lazy loading of popup content
- Debounced map movement handlers
- Optimized marker rendering using React-Leaflet
- Server-side request logging for debugging
- Error handling with detailed logging

## Contributing

1. Fork the repository
2. Create a new branch for your feature
3. Make your changes
4. Submit a pull request

## License

GNU General Public License v3.0
This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
You should have received a copy of the GNU General Public License along with this program. If not, see https://www.gnu.org/licenses/.

## Acknowledgments

- Data provided by [eBird](https://ebird.org)
- Map tiles from [OpenStreetMap](https://www.openstreetmap.org)
- Icons from Leaflet's default icon set
