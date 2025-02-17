# Bird Sightings Map

An interactive web application that displays bird sightings on a map using data from eBird. Users can explore both recent and rare bird observations in different locations, search for specific areas, and view detailed information about bird sightings including photos.

## Features

- Interactive map interface using React-Leaflet
- Two viewing modes:
  - Recent bird sightings
  - Rare/notable bird sightings
- Configurable time window (1, 3, 7, 14, or 30 days)
- Location search functionality using OpenStreetMap's Nominatim service
- Current location detection
- Real-time bird sighting data from eBird API
- Bird photos integration from BirdWeather
- Clustered markers for multiple bird sightings at the same location
- Detailed popup information for each sighting including:
  - Species common name
  - Bird photos (when available)
  - Observation date
  - Links to eBird checklists
- Automatic data updates when moving to new map areas
- Mobile-responsive design
- Express.js backend with eBird API integration
- URL parameter support for sharing specific views
- Configurable search radius based on zoom level

## Prerequisites

- Node.js (v14 or higher) (https://nodejs.org)
- A valid eBird API key (https://documenter.getpostman.com/view/664302/S1ENwy59)

## Installation

1. Clone the repository:
```bash
git clone https://github.com/tomaskom/bird-sightings
cd bird-sightings
```

2. Install dependencies for both server and client:
```bash
# Install server dependencies
npm install

# Install client dependencies
cd client && npm install
```

3. Create a `.env` file in the `bird-sightings/server` directory and add your eBird API key:
```
EBIRD_API_KEY=your_api_key_here
PORT=3000  # Optional, defaults to 3000
ALLOWED_ORIGINS=http://localhost:5173
SERVER_DEBUG_LEVEL=1
```

4. Create a `.env` file in the `bird-sightings/client` directory and add the API URL:
```
VITE_API_URL=http://localhost:3000
VITE_DEBUG_LEVEL=1
```

5. Start the server from the server folder:
```bash
cd server
node start
```
 
6. In a separate terminal, start the client:
```bash
cd client
npm run dev
```

7. Navigate a browser window to the "Local" address listed when the client is launched. Use "Ctrl-C" to stop the server and "q ENTER" to stop the client.

## Project Structure

```
├── client/                     # Frontend
│   ├── src/
│   │   ├── components/
│   │   │   ├── BirdMap.jsx    # Main map component
│   │   │   ├── popups/        # Popup-related components
│   │   │   │   └── BirdPopups.jsx
│   │   │   ├── location/      # Location-related components
│   │   │   │   └── LocationControls.jsx
│   │   │   └── ui/           # UI components
│   │   │       └── Notifications.jsx
│   │   ├── utils/
│   │   │   ├── mapUtils.js    # Map-related utilities
│   │   │   ├── urlUtils.js    # URL parameter handling
│   │   │   ├── dataUtils.js   # Data fetching and processing
│   │   │   └── debug.js       # Client debug logging utilities
│   │   └── ...
│   ├── .env                    # Client environment variables
│   └── ...
├── server/                     # Backend
│   ├── server.js
│   ├── .env                    # Server environment variables
│   ├── utils/
│   │   └── debug.js            # Server debug logging utilities
│   └── ...
└── ...
```
## Server Implementation

The server.js server provides:

- Static file serving for the React application
- Proxy endpoints for eBird API requests
- CORS support for development
- Error handling and logging
- Support for both recent and rare bird sightings
- Configurable time window for sightings

### API Endpoints

#### GET /api/birds
Fetches bird sightings from eBird API.

Parameters:
- `lat` (required): Latitude of the search center
- `lng` (required): Longitude of the search center
- `dist` (optional): Search radius in kilometers
- `type` (optional): Sighting type ('recent' or 'rare')
- `back` (optional): Number of days to look back

Example request:
```bash
GET /api/birds?lat=36.9741&lng=-122.0308&dist=25&type=recent&back=7
```

## Dependencies

### Frontend
- react
- react-leaflet
- leaflet
- lodash
- leaflet.locatecontrol

### Backend
- express
- cors
- node-fetch
- dotenv

## Component Structure

### Main Components
- `BirdMap`: Core component handling map interface and state management
- `BirdMarker`: Optimized marker component for bird sighting locations

### Popup Components
- `BirdPopups.jsx`:
  - `BirdPopupContent`: Memoized component for sighting information display
  - `PopupInteractionHandler`: Manages map interactions during popup display
  - Includes photo modal and observation details components

### Location Components
- `LocationControls.jsx`:
  - `LocationControl`: Handles location detection and map navigation
  - Custom control button implementation

### UI Components
- `Notifications.jsx`:
  - `FadeNotification`: Temporary notification display
  - `LoadingOverlay`: Loading state indicator

### Utility Modules
- `mapUtils.js`: Map functionality helpers (icons, calculations, etc.)
- `dataUtils.js`: Data fetching and processing utilities
- `urlUtils.js`: URL parameter management
- `debug.js`: Debugging and logging utilities

## API Integration

The application integrates with four external APIs:
1. eBird API (via backend proxy) for bird sighting data
2. OpenStreetMap's Nominatim API for location search
3. BirdWeather API for bird photos
4. OpenStreetMap for map tiles

### Data Format

The application expects bird sighting data in the following format:

```javascript
{
  lat: number,
  lng: number,
  birds: [
    {
      comName: string,
      sciName: string,
      obsDt: string,
      obsValid: boolean,
      subIds: string[],
      thumbnailUrl?: string,
      fullPhotoUrl?: string
    }
  ]
}
```

## Performance Optimizations

- Memoized components to prevent unnecessary re-renders
- Clustered markers for locations with multiple sightings
- Lazy loading of popup content and photos
- Debounced map movement handlers
- Dynamic search radius based on viewport size
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
- Photos provided by [BirdWeather](https://birdweather.com)