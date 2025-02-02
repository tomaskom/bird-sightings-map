import React, { useState, useCallback, useRef, useEffect, memo } from 'react';
import { MapContainer, TileLayer, useMapEvents, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import _ from 'lodash';

// Marker icon workaround for React-Leaflet
import L from 'leaflet';
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

const DefaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});

// Create a special icon for locations with multiple birds
const MultipleIcon = L.divIcon({
  className: 'custom-div-icon',
  html: '<div style="background-color: #3B82F6; color: white; border-radius: 50%; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; border: 2px solid white;">+</div>',
  iconSize: [30, 30],
  iconAnchor: [15, 15]
});

L.Marker.prototype.options.icon = DefaultIcon;

// Memoized popup content component
const BirdPopupContent = memo(({ birds }) => (
  <div style={{ 
    maxHeight: '200px', 
    overflowY: 'auto',
    transform: 'translateZ(0)'
  }}>
    <h3 style={{ 
      fontWeight: 'bold', 
      marginBottom: '0.5rem',
      minHeight: '1.5rem'
    }}>
      {birds.length} {birds.length === 1 ? 'Bird' : 'Birds'} at this location
    </h3>
    {birds.map((bird, birdIndex) => (
      <div 
        key={`${bird.speciesCode}-${birdIndex}`}
        style={{ 
          borderBottom: birdIndex < birds.length - 1 ? '1px solid #e2e8f0' : 'none',
          padding: '0.5rem 0',
          minHeight: '4rem'
        }}
      >
        <h4 style={{ fontWeight: 'bold' }}>{bird.comName}</h4>
        <p style={{ fontSize: '0.9em', color: '#4B5563' }}>
          Observed: {new Date(bird.obsDt).toLocaleDateString()}
        </p>
      </div>
    ))}
  </div>
));

// Component for popup interaction handling
const PopupInteractionHandler = () => {
  const map = useMap();
  
  useEffect(() => {
    const handlePopupOpen = () => {
      if (map.dragging) {
        map.dragging.disable();
        setTimeout(() => map.dragging.enable(), 300);
      }
    };

    map.on('popupopen', handlePopupOpen);
    return () => {
      map.off('popupopen', handlePopupOpen);
    };
  }, [map]);

  return null;
};

// Optimized marker with popup handling
const BirdMarker = memo(({ location, icon }) => {
  const [isPopupOpen, setIsPopupOpen] = useState(false);
  
  const eventHandlers = useCallback({
    popupopen: () => setIsPopupOpen(true),
    popupclose: () => setIsPopupOpen(false),
  }, []);

  return (
    <Marker 
      position={[location.lat, location.lng]}
      icon={icon}
      eventHandlers={eventHandlers}
    >
      <Popup>
        {isPopupOpen && <BirdPopupContent birds={location.birds} />}
      </Popup>
    </Marker>
  );
});

// Component to handle map events
const MapEvents = ({ onMoveEnd }) => {
  const map = useMapEvents({
    moveend: () => {
      const center = map.getCenter();
      onMoveEnd(center);
    }
  });
  return null;
};

const BirdMap = () => {
  const [mapCenter, setMapCenter] = useState({ lat: 36.9741, lng: -122.0308 });
  const [birdSightings, setBirdSightings] = useState([]);
  const [showUpdateButton, setShowUpdateButton] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [mapRef, setMapRef] = useState(null);
  const inputRef = useRef(null);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchInput.trim() || !mapRef) return;

    if (inputRef.current) {
      inputRef.current.blur();
      document.body.style.transform = 'scale(1)';
      requestAnimationFrame(() => {
        window.scrollTo({
          top: 0,
          behavior: 'instant'
        });
      });
    }

    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchInput)}`
      );
      const data = await response.json();

      if (data && data[0]) {
        const { lat, lon } = data[0];
        mapRef.flyTo([lat, lon], 12);
        setSearchInput('');
      } else {
        alert('Location not found');
      }
    } catch (error) {
      console.error('Error searching location:', error);
      alert('Error searching location');
    }
  };

  const handleMoveEnd = useCallback((center) => {
    setMapCenter({ lat: center.lat, lng: center.lng });
    setShowUpdateButton(true);
  }, []);

  const fetchBirdData = async () => {
    setLoading(true);
    try {
      const lat = Number(mapCenter.lat.toFixed(4));
      const lng = Number(mapCenter.lng.toFixed(4));
      
      const response = await fetch(
         `${import.meta.env.VITE_API_URL}/api/birds?lat=${lat}&lng=${lng}`
       );
      
      if (!response.ok) {
        throw new Error('Failed to fetch bird sightings');
      }
      
      const data = await response.json();
      // Filter out invalid observations
      const validSightings = data.filter(sighting => sighting.obsValid === true);

      // Group sightings by location (lat/lng)
      const groupedSightings = _.groupBy(validSightings, sighting => `${sighting.lat},${sighting.lng}`);
      
      // Remove duplicates at each location while preserving all unique birds
      const processedSightings = Object.entries(groupedSightings).map(([locationKey, sightings]) => {
        const [lat, lng] = locationKey.split(',').map(Number);
        const uniqueBirds = _.uniqBy(sightings, 'comName');
        return {
          lat,
          lng,
          birds: uniqueBirds
        };
      });
      
      setBirdSightings(processedSightings);
    } catch (error) {
      console.error('Error fetching bird data:', error);
      alert('Error fetching bird sightings');
    } finally {
      setLoading(false);
    }
  };

  // Fetch data on component mount
  useEffect(() => {
    fetchBirdData();
  }, []);

  return (
    <div style={{ 
      flex: 1, 
      display: 'flex', 
      flexDirection: 'column', 
      minHeight: 0,
      width: 'calc(100% - 2rem)',
      margin: '0 auto',
    }}>
      <div style={{ 
        padding: '0.5rem', 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        borderBottom: '1px solid #e2e8f0',
        marginBottom: '1rem',
        gap: '1rem'
      }}>
        <form 
          onSubmit={handleSearch}
          style={{ display: 'flex', gap: '0.5rem', flex: 1 }}
        >
          <input
            ref={inputRef}
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Location..."
            style={{
              padding: '0.5rem',
              border: '1px solid #e2e8f0',
              borderRadius: '0.375rem',
              flex: 1
            }}
          />
          <button
            type="submit"
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: '#3B82F6',
              color: 'white',
              borderRadius: '0.375rem',
              cursor: 'pointer'
            }}
          >
            Go
          </button>
        </form>
      </div>
      
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        {showUpdateButton && (
          <button
            onClick={() => {
              fetchBirdData();
              setShowUpdateButton(false);
            }}
            disabled={loading}
            style={{
              position: 'absolute',
              top: '1rem',
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 1000,
              padding: '0.5rem 1rem',
              backgroundColor: loading ? '#93C5FD' : '#3B82F6',
              color: 'white',
              borderRadius: '0.375rem',
              cursor: loading ? 'not-allowed' : 'pointer',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
            }}
          >
            {loading ? 'Fetching...' : 'Update for this area'}
          </button>
        )}
        <MapContainer
          updateWhenZooming={false}
          updateWhenIdle={true}
          center={[36.9741, -122.0308]}
          zoom={12}
          style={{ 
            height: 'calc(100% - 1rem)', 
            width: '100%',
            borderRadius: '0.375rem'
          }}
          ref={setMapRef}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors | Data from <a href="https://ebird.org">eBird</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapEvents onMoveEnd={handleMoveEnd} />
          <PopupInteractionHandler />
          
          {birdSightings.map((location, index) => (
            <BirdMarker
              key={`${location.lat}-${location.lng}-${index}`}
              location={location}
              icon={location.birds.length > 1 ? MultipleIcon : DefaultIcon}
            />
          ))}
        </MapContainer>
      </div>
    </div>
  );
};

export default BirdMap;