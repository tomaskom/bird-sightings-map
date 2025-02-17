/**
 * Copyright (C) 2025 Michelle Tomasko
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 *
 * Project: bird-sightings-map
 * Description: Map for eBird records of bird sightings
 * 
 * Dependencies:
 * - OpenStreetMap data © OpenStreetMap contributors (ODbL)
 * - Leaflet © 2010-2024 Vladimir Agafonkin (BSD-2-Clause)
 * - eBird data provided by Cornell Lab of Ornithology
 * - Photos provided by BirdWeather
 */

import React, { useState, useCallback, useRef, useEffect, memo } from 'react';
import { MapContainer, TileLayer, useMapEvents, Marker, Popup, useMap } from 'react-leaflet';
import { debug } from '../../utils/debug';
import 'leaflet/dist/leaflet.css';
import 'leaflet.locatecontrol/dist/L.Control.Locate.min.css';
import 'leaflet.locatecontrol';
import _ from 'lodash';

// Marker icon workaround for React-Leaflet
import L from 'leaflet';
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

const getMapParamsFromUrl = () => {
  return new Promise((resolve) => {
    // Check if we're in an iframe
    const isInIframe = window !== window.parent;

    // If not in iframe, parse URL directly
    if (!isInIframe) {
      try {
        const params = new URLSearchParams(window.location.search);
        debug.debug('Parsing URL parameters directly:', Object.fromEntries(params));
        resolve({
          lat: parseFloat(params.get('lat')) || 36.9741,
          lng: parseFloat(params.get('lng')) || -122.0308,
          zoom: parseInt(params.get('zoom')) || 12,
          back: params.get('back') || '7',
          sightingType: params.get('type') || 'recent'
        });
      } catch(error) {
        debug.error('Error parsing URL parameters:', error);
        resolve({
          lat: 36.9741,
          lng: -122.0308,
          zoom: 12,
          back: '7',
          sightingType: 'recent'
        });
      }
      return;
    }

    let isResolved = false;
    // Handler for receiving message from parent
    const handleMessage = (event) => {
      debug.debug('Received message from parent:', event.origin, event.data);
      if (event.origin === 'https://www.michellestuff.com') {
        window.removeEventListener('message', handleMessage);
        if (isResolved) return;
        isResolved = true;
        try {
          const params = new URLSearchParams(event.data);
          debug.debug('Parsed iframe params:', Object.fromEntries(params));
          resolve({
            lat: parseFloat(params.get('lat')) || 36.9741,
            lng: parseFloat(params.get('lng')) || -122.0308,
            zoom: parseInt(params.get('zoom')) || 12,
            back: params.get('back') || '7',
            sightingType: params.get('type') || 'recent'
          });
        } catch(error) {
          debug.error('Error parsing URL parameters from iframe:', error);
          resolve({
            lat: 36.9741,
            lng: -122.0308,
            zoom: 12,
            back: '7',
            sightingType: 'recent'
          });
        }
      }
    };

    // Listen for response from parent
    window.addEventListener('message', handleMessage);

    // Request URL params from parent
    debug.debug('Sending getUrlParams message to parent');
    window.parent.postMessage('getUrlParams', '*');

    // Timeout after 500ms and use defaults
    setTimeout(() => {
      if (isResolved) return;
      isResolved = true;
      debug.debug('Timeout reached, using defaults');
      window.removeEventListener('message', handleMessage);
      resolve({
        lat: 36.9741,
        lng: -122.0308,
        zoom: 12,
        back: '7',
        sightingType: 'recent'
      });
    }, 500);
  });
};

const updateUrlParams = (params) => {
  try {
    // Check if we're in an iframe
    const isInIframe = window !== window.parent;

    if (!isInIframe) {
      // If not in iframe, update URL directly
      const url = new URL(window.location.href);
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          let paramValue = (key === 'lat' || key === 'lng') 
            ? parseFloat(value.toFixed(6)) 
            : value.toString();
          url.searchParams.set(key, paramValue);
        }
      });
      debug.debug('Updating URL params directly:', Object.fromEntries(url.searchParams));
      window.history.pushState({ path: url.href }, '', url.toString());
      return;
    }

    // Format parameters
    const formattedParams = {};
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        if (key === 'lat' || key === 'lng') {
          formattedParams[key] = parseFloat(value.toFixed(6));
        } else {
          formattedParams[key] = value;
        }
      }
    });
    
    // Send message to parent
    debug.debug('Sending parameters to parent:', formattedParams);
    window.parent.postMessage({
      type: 'updateUrlParams',
      params: formattedParams
    }, 'https://www.michellestuff.com');
  } catch (error) {
    debug.error('Error sending parameters to parent:', error);
  }
};


// Icon for single bird sightings
const DefaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});

// Create a special icon for locations with multiple birds
const MultipleIcon = L.divIcon({
  className: 'custom-div-icon',
  html: `
    <div style="
      background-color: #3B82F6; 
      color: white; 
      border-radius: 50%; 
      width: 30px; 
      height: 30px; 
      display: flex; 
      align-items: center; 
      justify-content: center; 
      border: 2px solid white;
    ">+</div>
  `,
  iconSize: [30, 30],
  iconAnchor: [15, 15]
});

debug.debug('Initializing map icons');
L.Marker.prototype.options.icon = DefaultIcon;

// Memoized popup content component
const BirdPopupContent = memo(({ birds }) => {
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  
  debug.debug('Rendering popup content for birds:', birds.length);

  return (
    <>
      {selectedPhoto && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 2000,
            cursor: 'pointer'
          }} 
          onClick={() => {
            debug.debug('Closing full-size photo view');
            setSelectedPhoto(null);
          }}
        >
          <img 
            src={selectedPhoto} 
            alt="Full size bird" 
            style={{
              maxWidth: '90%',
              maxHeight: '90%',
              objectFit: 'contain'
            }}
          />
        </div>
      )}
      <div style={{ 
        maxHeight: '225px', 
        overflowY: 'auto',
        transform: 'translateZ(0)'
      }}>
        <h3 style={{ 
          fontWeight: 'bold', 
          marginBottom: '-0.25rem',
          padding: '0',
        }}>
          {birds.length} {birds.length === 1 ? 'Bird' : 'Birds'} at this location
        </h3>
        {birds.map((bird, birdIndex) => (
          <div 
            key={`${bird.speciesCode}-${birdIndex}`}
            style={{ 
              borderBottom: birdIndex < birds.length - 1 ? '1px solid #e2e8f0' : 'none',
              padding: '0',
              paddingTop: '0.25rem',
              paddingBottom: '0.25rem'
            }}
          >
            <h4 style={{ fontWeight: 'bold' }}>{bird.comName}</h4>
            {bird.thumbnailUrl && (
              <img
                src={bird.thumbnailUrl}
                alt={bird.comName}
                style={{
                  width: '100px',
                  height: '75px',
                  objectFit: 'cover',
                  cursor: 'pointer',
                  marginBottom: '0.25rem',
                  borderRadius: '4px'
                }}
                onClick={() => {
                  debug.debug('Opening full-size photo for:', bird.comName);
                  setSelectedPhoto(bird.fullPhotoUrl);
                }}
              />
            )}
            <p style={{ 
              fontSize: '0.9em', 
              color: '#4B5563', 
              margin: '0.25rem' 
            }}>
              Last Observed: {new Date(bird.obsDt).toLocaleDateString()}
            </p>
            <p style={{ 
              fontSize: '0.8em', 
              color: '#6B7280', 
              wordBreak: 'break-all' 
            }}>
              Checklists: {bird.subIds.map((subId, index) => (
                <React.Fragment key={subId}>
                  <a 
                    href={`https://ebird.org/checklist/${subId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ 
                      color: '#3B82F6', 
                      textDecoration: 'underline' 
                    }}
                  >
                    {subId}
                  </a>
                  {index < bird.subIds.length - 1 ? ', ' : ''}
                </React.Fragment>
              ))}
            </p>
          </div>
        ))}
      </div>
    </>
  );
});

// Set display name for debugging purposes
BirdPopupContent.displayName = 'BirdPopupContent';

// Component for popup interaction handling
const PopupInteractionHandler = () => {
  const map = useMap();
  
  useEffect(() => {
    const handlePopupOpen = () => {
      debug.debug('Popup opened, temporarily disabling map drag');
      if (map.dragging) {
        map.dragging.disable();
        setTimeout(() => {
          map.dragging.enable();
          debug.debug('Map drag re-enabled');
        }, 300);
      }
    };

    map.on('popupopen', handlePopupOpen);
    return () => {
      debug.debug('Cleaning up popup interaction handler');
      map.off('popupopen', handlePopupOpen);
    };
  }, [map]);

  return null;
};

// Optimized marker with popup handling
const BirdMarker = memo(({ location, icon }) => {
  const [isPopupOpen, setIsPopupOpen] = useState(false);
  
  const eventHandlers = useCallback({
    popupopen: () => {
      debug.debug('Opening popup for location:', location.lat, location.lng);
      setIsPopupOpen(true);
    },
    popupclose: () => {
      debug.debug('Closing popup for location:', location.lat, location.lng);
      setIsPopupOpen(false);
    },
  }, [location.lat, location.lng]);

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

BirdMarker.displayName = 'BirdMarker';

const FadeNotification = () => {
  const [visible, setVisible] = useState(true);
  
  useEffect(() => {
    const timer = setTimeout(() => {
      debug.debug('Fading out notification');
      setVisible(false);
    }, 8000);
    
    return () => {
      debug.debug('Cleaning up notification timer');
      clearTimeout(timer);
    };
  }, []);
  
  if (!visible) return null;
  
  return (
    <div
      style={{
        position: 'absolute',
        bottom: '20px',
        left: '50%',
        transform: 'translateX(-50%)',
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        color: 'white',
        padding: '12px 20px',
        borderRadius: '8px',
        zIndex: 1000,
        maxWidth: '80%',
        textAlign: 'center',
        animation: 'fadeInOut 8s ease-in-out forwards',
      }}
    >
      <style>
        {`
          @keyframes fadeInOut {
            0% { opacity: 0; }
            10% { opacity: 1; }
            80% { opacity: 1; }
            100% { opacity: 0; }
          }
        `}
      </style>
      eBird API limits the number records returned for recent bird sightings. 
      You may see sightings change as you pan and increase as you zoom in.
    </div>
  );
};

// Component to handle map events
const MapEvents = ({ onMoveEnd, isPopupMoving }) => {
  const map = useMapEvents({
    dragstart: () => {
      debug.debug('Map drag started, closing all popups');
      map.eachLayer((layer) => {
        if (layer.getPopup && layer.getPopup()) {
          layer.closePopup();
        }
      });
    },
    moveend: () => {
      const center = map.getCenter();
      const zoom = map.getZoom();
      debug.debug('Map move ended:', { lat: center.lat, lng: center.lng, zoom });
      onMoveEnd(center);
      updateUrlParams({
        lat: center.lat,
        lng: center.lng,
        zoom: zoom,
      });
    }
  });
  return null;
};

const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const distance = R * c;
  
  debug.debug('Calculated distance:', { 
    from: { lat1, lon1 }, 
    to: { lat2, lon2 }, 
    distance 
  });
  
  return distance;
};

const LocationControl = () => {
  const map = useMap();
  const [isLocating, setIsLocating] = useState(false);
  
  const handleLocate = useCallback(() => {
    debug.debug('Location button clicked');
    setIsLocating(true);
    
    map.locate({
      setView: false,
      enableHighAccuracy: true
    });
  }, [map]);

  useEffect(() => {
    // Create custom control
    const customControl = L.Control.extend({
      options: {
        position: 'topright'
      },
      
      onAdd: function() {
        const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
        const button = L.DomUtil.create('a', 'leaflet-control-locate', container);
        
        // Style the button
        button.style.width = '34px';
        button.style.height = '34px';
        button.style.cursor = 'pointer';
        button.style.display = 'flex';
        button.style.alignItems = 'center';
        button.style.justifyContent = 'center';
        button.style.color = 'white';
        button.style.backgroundColor = isLocating ? '#FD8F47' : '#FD7014';
        button.title = 'Show current location';
        
        // Add location icon
        button.innerHTML = `
          <svg 
            xmlns="http://www.w3.org/2000/svg" 
            height="20" 
            width="20" 
            viewBox="0 -960 960 960" 
            fill="white"
          >
            <path d="M516-120 402-402 120-516v-56l720-268-268 720h-56Zm26-148 162-436-436 162 196 78 78 196Zm-78-196Z"/>
          </svg>
        `;
        
        L.DomEvent.on(button, 'click', function(e) {
          L.DomEvent.stopPropagation(e);
          L.DomEvent.preventDefault(e);
          handleLocate();
        });
        
        return container;
      }
    });
    
    debug.debug('Adding location control to map');
    const locateControl = new customControl();
    map.addControl(locateControl);
    
    // Set up event handlers
    const onLocationFound = (e) => {
      debug.info('User location found:', { 
        lat: e.latlng.lat, 
        lng: e.latlng.lng,
        accuracy: e.accuracy 
      });
      map.flyTo(e.latlng, 12);
      setIsLocating(false);
    };
    
    const onLocationError = (e) => {
      debug.error('Location error:', e.message);
      alert('Unable to get your location. Check your Location Services settings.');
      setIsLocating(false);
    };
    
    map.on('locationfound', onLocationFound);
    map.on('locationerror', onLocationError);
    
    return () => {
      debug.debug('Cleaning up location control');
      map.removeControl(locateControl);
      map.off('locationfound', onLocationFound);
      map.off('locationerror', onLocationError);
    };
  }, [map, handleLocate, isLocating]);
  
  return null;
};

LocationControl.displayName = 'LocationControl';

const BirdMap = () => {
  // State declarations
  const [urlParams, setUrlParams] = useState(null);
  const [mapCenter, setMapCenter] = useState(null);
  const [lastFetchLocation, setLastFetchLocation] = useState(null);
  const [lastFetchParams, setLastFetchParams] = useState(null);
  const [birdSightings, setBirdSightings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [mapRef, setMapRef] = useState(null);
  const [sightingType, setSightingType] = useState('recent');
  const [back, setBack] = useState('7');
  const [zoom, setZoom] = useState(null);
  const [isPopupMoving, setIsPopupMoving] = useState(false);
  const [showNotification, setShowNotification] = useState(true);
  const inputRef = useRef(null);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchInput.trim() || !mapRef) return;

    debug.debug('Initiating location search for:', searchInput);

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
        debug.info('Location found:', { lat, lon, displayName: data[0].display_name });
        mapRef.flyTo([lat, lon], 12);
        setSearchInput('');
      } else {
        debug.warn('No location found for search:', searchInput);
        alert('Location not found');
      }
    } catch (error) {
      debug.error('Error searching location:', error);
      alert('Error searching location');
    }
  };

  const handleDaysChange = (e) => {
    const newDays = e.target.value;
    debug.debug('Changing days back to:', newDays);
    setBack(newDays);
    if (mapRef) {
      updateUrlParams({
        back: newDays,
      });
    }
  };

  const handleCurrentLocation = () => {
    if (!mapRef || !navigator.geolocation) {
      debug.warn('Geolocation not available');
      return;
    }
    
    debug.debug('Requesting current location');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        debug.info('Current location found:', { latitude, longitude });
        mapRef.flyTo([latitude, longitude], 12);
      },
      (error) => {
        debug.error('Error getting location:', error.message);
        alert('Unable to get your location. Check your Location Services settings.');
      }
    );
  };

  const handleMoveEnd = useCallback((center) => {
    if (!isPopupMoving) {
      debug.debug('Map move ended at:', { lat: center.lat, lng: center.lng });
      setMapCenter({ lat: center.lat, lng: center.lng });
    }
  }, [isPopupMoving]);

  // Show notification only once on initial mount
  useEffect(() => {
    debug.debug('Initializing notification state');
    setShowNotification(true);
  }, []);

const fetchBirdData = async () => {

  const bounds = mapRef.getBounds();
  const ne = bounds.getNorthEast();
  const sw = bounds.getSouthWest();
         
  const xDistance = calculateDistance(ne.lat, ne.lng, ne.lat, sw.lng);
  const yDistance = calculateDistance(ne.lat, ne.lng, sw.lat, ne.lng);
  const currentRadius = Math.min(Math.max(xDistance, yDistance) / 2, 25);
      
  debug.debug('Calculated viewport distances:', { 
    xDistance, 
    yDistance, 
    currentRadius 
  });

    // Check if parameters have changed
    const paramsChanged = !lastFetchParams || 
      lastFetchParams.back !== back || 
      lastFetchParams.sightingType !== sightingType;

    // Check if radius has changed significantly (more than 1 km)
    const radiusChanged = lastFetchParams && 
      Math.abs(lastFetchParams.radius - currentRadius) > 1;

    // Check if we should skip fetching based on distance
    if (!paramsChanged && !radiusChanged && lastFetchLocation) {
      const distance = calculateDistance(
        lastFetchLocation.lat,
        lastFetchLocation.lng,
        mapCenter.lat,
        mapCenter.lng
      );
      // Calculate sensitivity threshold as 80% of current viewport radius
      const sensitivityThreshold = currentRadius * 0.80;
      
      debug.debug('Checking fetch threshold:', {
        distance,
        sensitivityThreshold,
        shouldSkip: distance < sensitivityThreshold
      });
      
      if (distance < sensitivityThreshold) {
        debug.debug('Skipping fetch - within threshold');
        return;
      }
    }

    setLoading(true);
    try {
      const lat = Number(mapCenter.lat.toFixed(4));
      const lng = Number(mapCenter.lng.toFixed(4));   

      // Construct the API URL based on sighting type
      const params = new URLSearchParams({
        lat: lat.toString(),
        lng: lng.toString(),
        dist: (currentRadius + 0.3).toFixed(1),
        type: sightingType,
        back: back.toString()
      });

      debug.info('Fetching bird data:', Object.fromEntries(params));
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/birds?${params}`);
  
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      debug.debug('Received bird data:', { 
        totalRecords: data.length,
        validRecords: data.filter(s => s.obsValid === true).length
      });

      const validSightings = data.filter(sighting => sighting.obsValid === true);
      const groupedByLocation = _.groupBy(validSightings, sighting => 
        `${sighting.lat},${sighting.lng}`
      );
  
      // Get unique species for photo lookup
      const uniqueSpecies = [...new Set(validSightings.map(
        sighting => `${sighting.sciName}_${sighting.comName}`
      ))];
  
      debug.debug('Processing unique species:', uniqueSpecies.length);

      // Fetch photos for all species at once
      let speciesPhotos = {};
      try {
        const photoResponse = await fetch('https://app.birdweather.com/api/v1/species/lookup', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            species: uniqueSpecies,
            fields: ['imageUrl', 'thumbnailUrl']
          })
        });
        
        if (photoResponse.ok) {
          const photoData = await photoResponse.json();
          speciesPhotos = photoData.species;
          debug.debug('Retrieved photos for species:', Object.keys(speciesPhotos).length);
        }
      } catch (error) {
        debug.error('Error fetching species photos:', error);
      }
      
      const processedSightings = Object.entries(groupedByLocation).map(([locationKey, sightings]) => {
        const [lat, lng] = locationKey.split(',').map(Number);
        const birdsBySpecies = _.groupBy(sightings, 'comName');
        
        const birds = Object.entries(birdsBySpecies).map(([comName, speciesSightings]) => {
          const baseData = {
            ...speciesSightings[0],
            subIds: speciesSightings.map(s => s.subId)
          };
  
          // Add photo URLs if available
          const speciesKey = `${baseData.sciName}_${baseData.comName}`;
          const photoData = speciesPhotos[speciesKey];
          if (photoData) {
            baseData.thumbnailUrl = photoData.thumbnailUrl;
            baseData.fullPhotoUrl = photoData.imageUrl;
          }
  
          return baseData;
        });
        
        return {
          lat,
          lng,
          birds
        };
      });
      
      debug.info('Processed sightings:', { 
        locations: processedSightings.length,
        totalBirds: processedSightings.reduce((sum, loc) => sum + loc.birds.length, 0)
      });
      
      setBirdSightings(processedSightings);

      // Store the last location we've fetched for
      setLastFetchLocation({ lat, lng });
      setLastFetchParams({ back, sightingType, radius: currentRadius });

    } catch (error) {
      debug.error('Error fetching bird data:', error);
      alert('Error fetching bird sightings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    debug.debug('Fetch effect running with:', { 
         loading, 
         mapCenter, 
         sightingType, 
         back, 
         zoom,
         hasMapRef: !!mapRef 
    });
    if (!loading && mapCenter && sightingType && back && zoom && mapRef) {
      debug.debug('Triggering bird data fetch:', { mapCenter, sightingType, back, zoom });
      fetchBirdData();
    } else {
      debug.debug('Not fetching because:', {
          loading,
          hasMapCenter: !!mapCenter,
          hasSightingType: !!sightingType,
          hasBack: !!back,
          hasZoom: !!zoom,
          hasMapRef: !!mapRef
      });
    }
  }, [back, sightingType, mapCenter, zoom, mapRef]);

  // Load URL parameters on component mount
  useEffect(() => {
    const loadUrlParams = async () => {
      try {
        debug.debug('Loading URL parameters');
        const params = await getMapParamsFromUrl();
        setUrlParams(params);
        setMapCenter({ lat: params.lat, lng: params.lng });
        setSightingType(params.sightingType);
        setBack(params.back);
        setZoom(params.zoom)
        // Force a fetch with the new parameters
        setLastFetchParams(null);
        debug.info('URL parameters loaded:', params);
      } catch (error) {
        debug.error('Error loading URL parameters:', error);
      }
    };
    loadUrlParams();
  }, []);

  return (
    <div style={{ 
      flex: 1, 
      display: 'flex', 
      flexDirection: 'column', 
      minHeight: 0,
      width: '100%',
      backgroundColor: '#DAD9D9'
    }}>
      <div style={{ 
        padding: '0.5rem', 
        display: 'flex', 
        flexWrap: 'wrap',
        alignItems: 'flex-start',
        gap: '1rem'
      }}>
        <div style={{ 
          display: 'flex', 
          gap: '0.5rem', 
          alignItems: 'center',
          flexWrap: 'wrap',
          minWidth: '280px'
        }}>
          <select
            value={sightingType}
            onChange={(e) => {
              const newType = e.target.value;
              debug.debug('Changing sighting type to:', newType);
              setSightingType(newType);
              if (mapRef) {
                updateUrlParams({
                  type: newType
                });
              }
              setLastFetchParams(null);
            }}
            disabled={loading}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: loading ? '#FD8F47' : '#FD7014',
              color: 'white',
              borderRadius: '0.375rem',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: '1rem'  
            }}
          >
            <option value="recent">Recent Sightings</option>
            <option value="rare">Rare Bird Sightings</option>
          </select>
  
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '0.25rem',
            whiteSpace: 'nowrap'
          }}>
            <span style={{ color: 'black' }}>Last</span>
            <select
              value={back}
              onChange={handleDaysChange}
              style={{
                padding: '0.5rem',
                border: '1px solid #e2e8f0',
                borderRadius: '0.375rem',
                backgroundColor: 'white',
                color: 'black'
              }}
            >
              <option value="1">1</option>
              <option value="3">3</option>
              <option value="7">7</option>
              <option value="14">14</option>
              <option value="30">30</option>
            </select>
            <span style={{ color: 'black' }}>days</span>
          </div>
        </div>
  
        <form 
          onSubmit={handleSearch}
          style={{ 
            display: 'flex', 
            gap: '0.25rem', 
            flex: 1,
            minWidth: '280px'
          }}
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
              flex: 1,
              backgroundColor: 'white',
              color: 'black',
              fontSize: '1rem'  
            }}
          />
          <button
            type="submit"
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: '#FD7014',
              color: 'white',
              borderRadius: '0.375rem',
              cursor: 'pointer',
              whiteSpace: 'nowrap'
            }}
          >
            Go
          </button>
        </form>
      </div>
      
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        {!urlParams ? (
          <div style={{
            height: '100%',
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#DAD9D9',
            borderRadius: '0.375rem'
          }}>
            Loading map...
          </div>
        ) : (
          <MapContainer
            updateWhenZooming={false}
            updateWhenIdle={true}
            center={[urlParams.lat, urlParams.lng]}
            zoom={urlParams.zoom}
            style={{ 
              height: '100%', 
              width: '100%',
              borderRadius: '0.375rem',
              position: 'relative'
            }}
            ref={(ref) => {
              debug.debug('MapContainer ref callback:', { hasRef: !!ref, urlParams });
              setMapRef(ref);
            }} 
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors | Data: <a href="https://ebird.org" target="_blank" rel="noopener noreferrer">eBird</a> | Photos: <a href="https://birdweather.com" target="_blank" rel="noopener noreferrer">BirdWeather</a> | &copy; <a href="https://michellestuff.com">Michelle Tomasko</a> | Licensed under <a href="https://www.gnu.org/licenses/gpl-3.0.en.html" target="_blank" rel="noopener noreferrer">GPL v3</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <MapEvents 
              onMoveEnd={handleMoveEnd}
            />
            <PopupInteractionHandler />
            <LocationControl />
            {birdSightings.map((location, index) => (
              <BirdMarker
                key={`${location.lat}-${location.lng}-${index}`}
                location={location}
                icon={location.birds.length > 1 ? MultipleIcon : DefaultIcon}
              />
            ))}
            {showNotification && <FadeNotification />}
            {loading && (
              <div 
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  zIndex: 1000,
                  touchAction: 'none',
                  pointerEvents: 'all',
                  userSelect: 'none',
                  WebkitTouchCallout: 'none',
                  WebkitUserSelect: 'none',
                  MozUserSelect: 'none',
                  msUserSelect: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
                onTouchStart={(e) => e.preventDefault()}
                onTouchMove={(e) => e.preventDefault()}
                onTouchEnd={(e) => e.preventDefault()}
                onClick={(e) => e.preventDefault()}
              >
                <div style={{
                  width: '40px',
                  height: '40px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: 'rgba(253, 112, 20, 0.8)',
                  borderRadius: '50%',
                  boxShadow: '0 2px 4px rgba(0, 0, 0, 0.7)'
                }}>
                  <svg 
                    width="24" 
                    height="24" 
                    viewBox="0 0 24 24"
                    style={{
                      animation: 'spin 1s linear infinite',
                      color: '#ffffff'
                    }}
                  >
                    <style>
                      {`
                        @keyframes spin {
                          to { transform: rotate(360deg); }
                        }
                      `}
                    </style>
                    <path
                      fill="currentColor"
                      d="M12,4a8,8,0,0,1,7.89,6.7A1.53,1.53,0,0,0,21.38,12h0a1.5,1.5,0,0,0,1.48-1.75,11,11,0,0,0-21.72,0A1.5,1.5,0,0,0,2.62,12h0a1.53,1.53,0,0,0,1.49-1.3A8,8,0,0,1,12,4Z"
                    />
                  </svg>
                </div>
              </div>
            )}
          </MapContainer>
        )}
      </div>
    </div>
  );
};

export default BirdMap;