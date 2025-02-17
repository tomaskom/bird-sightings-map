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
import { MapContainer, TileLayer, useMapEvents, Marker, Popup } from 'react-leaflet';
import { debug } from '../utils/debug';
import {
  DefaultIcon,
  MultipleIcon,
  initializeMapIcons,
  calculateViewportRadius,
  shouldFetchNewData,
  formatCoordinates
} from '../utils/mapUtils';
import { getMapParamsFromUrl, updateUrlParams } from '../utils/urlUtils';
import { fetchBirdPhotos, processBirdSightings, buildApiUrl } from '../utils/dataUtils';
import { BirdPopupContent, PopupInteractionHandler } from '../components/popups/BirdPopups';
import { LocationControl } from '../components/location/LocationControls';
import { FadeNotification, LoadingOverlay } from '../components/ui/Notifications';
import 'leaflet/dist/leaflet.css';
import 'leaflet.locatecontrol/dist/L.Control.Locate.min.css';
import 'leaflet.locatecontrol';

// Initialize default map icons
initializeMapIcons();

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

// Component to handle map events
const MapEvents = ({ onMoveEnd }) => {
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

  const handleMoveEnd = useCallback((center) => {
    debug.debug('Map move ended at:', { lat: center.lat, lng: center.lng });
    setMapCenter({ lat: center.lat, lng: center.lng });
  }, []);
  const fetchBirdData = async () => {
    const currentRadius = calculateViewportRadius(mapRef.getBounds());
    const currentParams = { back, sightingType, radius: currentRadius };

    if (!shouldFetchNewData(
      lastFetchParams,
      currentParams,
      lastFetchLocation,
      mapCenter
    )) {
      debug.debug('Skipping fetch - within threshold');
      return;
    }

    setLoading(true);
    try {
      const { lat, lng } = formatCoordinates(mapCenter.lat, mapCenter.lng);
      const apiUrl = buildApiUrl({
        lat,
        lng,
        radius: currentRadius,
        type: sightingType,
        back
      });

      debug.info('Fetching bird data:', {
        lat,
        lng,
        radius: currentRadius,
        type: sightingType,
        back
      });

      const response = await fetch(apiUrl);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      const uniqueSpecies = [...new Set(data
        .filter(sighting => sighting.obsValid === true)
        .map(sighting => `${sighting.sciName}_${sighting.comName}`))];

      const speciesPhotos = await fetchBirdPhotos(uniqueSpecies);
      const processedSightings = processBirdSightings(data, speciesPhotos);

      setBirdSightings(processedSightings);
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
      debug.debug('Triggering bird data fetch');
      fetchBirdData();
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
        setZoom(params.zoom);
        setLastFetchParams(null);
        debug.info('URL parameters loaded:', params);
      } catch (error) {
        debug.error('Error loading URL parameters:', error);
      }
    };
    loadUrlParams();
  }, []);

  // Show notification only once on initial mount
  useEffect(() => {
    debug.debug('Initializing notification state');
    setShowNotification(true);
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
            {loading && <LoadingOverlay />}
          </MapContainer>
        )}
      </div>
    </div>
  );
};

export default BirdMap;