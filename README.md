# Bird Sightings Map

An interactive web application that displays bird sightings on a map using data from eBird. Users can explore both recent and rare bird observations in different locations, search for specific areas, filter species, and view detailed information about bird sightings including photos.

## Features

- Interactive map interface using React-Leaflet
- Viewing modes:
  - All bird sightings
  - Rare/notable bird sightings
  - Species-specific filtering
- Configurable time window (1, 3, 7, 14, or 30 days)
- Location search functionality using OpenStreetMap's Nominatim service
- Current location detection
- Real-time bird sighting data from eBird API
- Bird photos integration from BirdWeather
- Region-specific species lists that update as you navigate
- Enhanced species search with visual indicators:
  - Birds visible on the current map are highlighted and sorted to the top
  - Notable/rare birds are marked with badges for quick identification
  - Search results organized into "Birds on map" and "Other birds" sections
- Clustered markers for multiple bird sightings at the same location
- Detailed popup information for each sighting including:
  - Species common name
  - Scientific name
  - Bird photos (when available)
  - Observation date
  - Links to eBird checklists
- Automatic data updates when moving to new map areas
- Mobile-responsive design
- Express.js backend with eBird API integration
- URL parameter support for sharing specific views
- Configurable search radius based on zoom level
- Tile-based caching system for optimized API requests and reduced eBird API usage
- Secure admin endpoints for cache monitoring and management

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
ADMIN_API_KEY=your_admin_key_here  # For accessing admin endpoints
CACHE_TTL=3600000  # Cache time-to-live in milliseconds (default: 1 hour)
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
├── client/                      # Frontend
│   ├── src/
│   │   ├── components/
│   │   │   ├── BirdMap.jsx      # Main map component
│   │   │   ├── location/        
│   │   │   │   └── LocationControls.jsx
│   │   │   ├── popups/          
│   │   │   │   └── BirdPopups.jsx
│   │   │   └── ui/              
│   │   │       ├── Notifications.jsx
│   │   │       └── SpeciesSearch.jsx   # Species search box and dropdown list
│   │   ├── data/                # Data files for taxonomy
│   │   │   └── ebird_taxonomy.csv  # eBird taxonomy data (Oct 2024)
│   │   ├── scripts/             # Utility scripts
│   │   │   ├── build-debug.js   # build logging utilities
│   │   │   └── buildTaxonomy.js  # Script to convert eBird taxonomy CSV to JSON
│   │   ├── styles/              # Styling configurations
│   │   │   ├── colors.js
│   │   │   ├── controls.js
│   │   │   └── layout.js
│   │   ├── utils/               # Utility functions
│   │   │   ├── dataUtils.js     # Data fetching and processing
│   │   │   ├── debug.js         # Client debug logging utilities
│   │   │   ├── mapconstants.js  # Map constants and configuration
│   │   │   ├── mapUtils.js      # Map utility functions
│   │   │   ├── taxonomyData.js  # Processed taxonomy data
│   │   │   ├── taxonomyUtils.js # Species taxonomy handling
│   │   │   ├── taxonomyTypes.ts # TypeScript interfaces for taxonomy
│   │   │   └── urlUtils.js      # URL parameter handling
│   │   ├── App.css
│   │   ├── App.jsx
│   │   ├── index.css
│   │   └── main.jsx
│   ├── public/                  # Favicons
│   ├── .env                     # Client environment variables
│   └── ...
├── server/                      # Backend
│   ├── server.js                # Express server with API endpoints
│   ├── .env                     # Server environment variables
│   ├── services/
│   │   └── birdDataService.js   # Service for fetching and caching bird data
│   ├── utils/
│   │   ├── cacheManager.js      # Tile-based caching system
│   │   ├── debug.js             # Server debug logging utilities
│   │   └── viewportUtils.js     # Utilities for viewport calculations
│   └── ...
└── ...
```

## Server Implementation

The server.js server provides:

- Static file serving for the React application
- Proxy endpoints for eBird API requests
- Geocoding services (forward and reverse)
- Region-specific species list lookups
- CORS support for development
- Error handling and logging
- Support for both common and rare bird sightings
- Configurable time window for sightings
- Tile-based caching system for efficient data retrieval and reduced API calls
- API key-protected admin endpoints for monitoring and managing the cache

### API Endpoints

#### GET /api/birds/viewport
Fetches bird sightings from eBird API using map viewport coordinates.

Parameters:
- `minLat` (required): Southern boundary latitude of the viewport
- `maxLat` (required): Northern boundary latitude of the viewport
- `minLng` (required): Western boundary longitude of the viewport
- `maxLng` (required): Eastern boundary longitude of the viewport
- `back` (optional): Number of days to look back

Example request:
```bash
GET /api/birds/viewport?minLat=36.9&maxLat=37.1&minLng=-122.1&maxLng=-121.9&back=7
```

This endpoint uses a tile-based caching system to efficiently fetch and store data. It divides the viewport into standard map tiles and combines cached data with fresh requests as needed. The API will return both regular and notable birds in a single response, with each record marked with an `isNotable` flag for client-side filtering.

#### GET /api/region-species/:regionCode
Fetches species list for a specific eBird region.

Parameters:
- `regionCode` (required): eBird region code (e.g., "US-CA")

Example request:
```bash
GET /api/region-species/US-CA
```

#### GET /api/forward-geocode
Performs forward geocoding to find locations by name.

Parameters:
- `q` (required): Location query string

Example request:
```bash
GET /api/forward-geocode?q=Santa%20Cruz,%20CA
```

#### GET /api/reverse-geocode
Performs reverse geocoding to get location details from coordinates.

Parameters:
- `lat` (required): Latitude
- `lon` (required): Longitude

Example request:
```bash
GET /api/reverse-geocode?lat=36.9741&lon=-122.0308
```

#### Admin Endpoints

These endpoints require API key authentication:

#### GET /api/admin/cache-stats
Returns detailed statistics about the tile cache system.

#### GET /api/admin/clear-expired-cache
Manually clears expired cache entries and returns the number of removed items.

#### GET /api/admin/dashboard
Interactive HTML dashboard for monitoring cache performance with visualizations.

#### GET /api/admin/tile-debug
Debug tool for visualizing how a viewport is divided into tiles.

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
- express-rate-limit
- chart.js (for admin dashboard)

## Component Structure

### Main Components
- `BirdMap`: Core component handling map interface and state management
- `BirdMarker`: Optimized marker component for bird sighting locations
- `MapEvents`: Handles map movement and viewport changes
- `SpeciesSearch`: Dropdown component for filtering bird species

### Popup Components
- `BirdPopups.jsx`:
  - `BirdPopupContent`: Memoized component for sighting information display
  - `PopupInteractionHandler`: Manages map interactions during popup display

### Location Components
- `LocationControls.jsx`:
  - `LocationControl`: Handles location detection and map navigation

### UI Components
- `Notifications.jsx`:
  - `FadeNotification`: Temporary notification display
  - `LoadingOverlay`: Loading state indicator
- `SpeciesSearch.jsx`: Species filtering dropdown with smart search functionality and visual indicators for visible and notable birds

### Utility Modules
- `mapUtils.js`: Map functionality helpers (icons, calculations, caching)
- `dataUtils.js`: Data fetching and processing utilities
- `urlUtils.js`: URL parameter management for direct links and iframe embedding
- `taxonomyUtils.js`: Species list management and filtering
- `taxonomyData.js`: Contains processed bird taxonomy data
- `taxonomyTypes.ts`: TypeScript interfaces for taxonomy structures
- `debug.js`: Configurable debugging and logging utilities

### Style Modules
- `colors.js`: Color schemes for UI components
- `controls.js`: Styles for buttons, inputs, and interactive elements
- `layout.js`: Layout styles for containers, popups, and notifications

## API Integration

The application integrates with four external APIs:
1. eBird API (via backend proxy) for bird sighting data and species lists
2. OpenStreetMap's Nominatim API for location search and reverse geocoding
3. BirdWeather API for bird photos
4. OpenStreetMap for map tiles

## Taxonomy Data

The application uses the eBird Taxonomy dataset for bird species information:

- **Data Source**: [eBird Taxonomy](https://science.ebird.org/en/use-ebird-data/the-ebird-taxonomy)
- **Last Updated**: October 2024
- **Processing**: A script converts the CSV taxonomy file into a JSON format used by the application
- **Data Structure**: Each taxonomy entry contains:
  - `speciesCode`: Unique identifier for the species in eBird
  - `commonName`: English common name for display
  - `scientificName`: Latin scientific name
  - `taxonOrder`: Numeric value for sorting species in taxonomic order
  - `category`: Type of entry (species, hybrid, etc.)

The taxonomy data provides the foundation for species filtering, display, and organization throughout the application. It enables features like the species search dropdown and proper sorting of bird lists in taxonomic order.

### Data Flow

1. User navigates the map or searches for a location
2. Application detects the current region (country/state)
3. Region-specific species lists are fetched and cached
4. Bird sightings are retrieved based on viewport location and filters
5. Notable bird information is fetched concurrently for badge display
6. Sightings are grouped by location and displayed as markers
7. Currently visible species are tracked and highlighted in the dropdown
8. Photos are fetched for visible species
9. URL parameters are updated to allow direct linking

## Performance Optimizations

- Tile-based caching system for efficient bird data retrieval
- Background tile fetching for improved user experience
- Memoized components to prevent unnecessary re-renders
- Clustered markers for locations with multiple sightings
- Lazy loading of popup content and photos
- Debounced map movement handlers
- Species list caching by region
- Country bounds caching for faster region detection
- Dynamic search radius based on viewport size
- Rate limiting for geocoding API requests
- Server-side error handling with detailed logging
- Cache statistics dashboard for monitoring and optimization
- Automatic cache expiration with configurable TTL (time-to-live)
- Parallel requests with smart prioritization of center tiles

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

## Server Configuration

The server can be configured with the following environment variables:

```
EBIRD_API_KEY          # Required: Your eBird API key
PORT                   # Optional: Port to run the server on (default: 3000)
ALLOWED_ORIGINS        # Required: Comma-separated list of allowed origins for CORS
SERVER_DEBUG_LEVEL     # Optional: Debug level (0-4, default: 1)
ADMIN_API_KEY          # Recommended in deployment: API key for admin endpoints
CACHE_TTL              # Optional: Cache time-to-live in milliseconds (default: 3600000)
TILE_SIZE_KM           # Optional: Size of map tiles in kilometers (default: 2)
TILE_RADIUS_BUFFER     # Optional: Buffer multiplier for tile radius (default: 1.1)
CACHE_CLEANUP_INTERVAL_MINUTES # Optional: Interval for automatic cache cleanup (default: 15)
```

## Acknowledgments

- Data provided by [eBird](https://ebird.org)
- Map tiles from [OpenStreetMap](https://www.openstreetmap.org)
- Photos provided by [BirdWeather](https://birdweather.com)
- Leaflet mapping library and plugins
- Chart.js for admin dashboard visualizations
- 🤖 Co-Authored-By: Claude noreply@anthropic.com