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
import { MAP_CONTROL_STYLES } from '../styles/controls';
import { LAYOUT_STYLES } from '../styles/layout';
import { COLORS } from '../styles/colors';
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
import {
  MAP_TILE_URL,
  DAYS_BACK_OPTIONS,
  SIGHTING_TYPES,
  DEFAULT_MAP_PARAMS,
  generateAttribution
} from '../utils/mapconstants';
import { BirdPopupContent, PopupInteractionHandler } from '../components/popups/BirdPopups';
import { LocationControl } from '../components/location/LocationControls';
import { FadeNotification, LoadingOverlay } from '../components/ui/Notifications';
import 'leaflet/dist/leaflet.css';
import 'leaflet.locatecontrol/dist/L.Control.Locate.min.css';
import 'leaflet.locatecontrol';

// Initialize default map icons
initializeMapIcons();

/**
 * Memoized marker component that displays bird sighting locations
 * @param {Object} props - Component props
 * @param {Object} props.location - Location data with coordinates and birds
 * @param {L.Icon} props.icon - Leaflet icon to display
 */
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

/**
 * Component that handles map events and updates
 * @param {Object} props - Component props
 * @param {Function} props.onMoveEnd - Callback for map movement end
 */
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

/**
 * Main map component that displays bird sightings and handles user interactions
 * Manages state for map location, sightings data, search, and filtering
 */
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
  const [sightingType, setSightingType] = useState(DEFAULT_MAP_PARAMS.sightingType);
  const [back, setBack] = useState(DEFAULT_MAP_PARAMS.back);
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
    <div style={LAYOUT_STYLES.container}>
      <div style={LAYOUT_STYLES.controlsWrapper}>
        <div style={LAYOUT_STYLES.controlGroup}>
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
              ...MAP_CONTROL_STYLES.select,
              ...(loading && MAP_CONTROL_STYLES.selectDisabled)
            }}
          >
            <option value={SIGHTING_TYPES.RECENT}>Recent Sightings</option>
            <option value={SIGHTING_TYPES.RARE}>Rare Bird Sightings</option>
          </select>

          <div style={LAYOUT_STYLES.pullDown}>
            <span style={{ color: COLORS.text.primary }}>Last</span>
            <select
              value={back}
              onChange={handleDaysChange}
              style={MAP_CONTROL_STYLES.input}
            >
              {DAYS_BACK_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <span style={{ color: COLORS.text.primary }}>days</span>
          </div>
        </div>

        <form
          onSubmit={handleSearch}
          style={LAYOUT_STYLES.searchForm}
        >
          <input
            ref={inputRef}
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Location..."
            style={{
              ...MAP_CONTROL_STYLES.input,
              flex: 1
            }}
          />
          <button
            type="submit"
            style={MAP_CONTROL_STYLES.button}
          >
            Go
          </button>
        </form>
      </div>

      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        {!urlParams ? (
          <div style={LAYOUT_STYLES.loadingContainer}>
            Loading map...
          </div>
        ) : (
          <MapContainer
            updateWhenZooming={false}
            updateWhenIdle={true}
            center={[urlParams.lat, urlParams.lng]}
            zoom={urlParams.zoom}
            style={LAYOUT_STYLES.map}
            ref={(ref) => {
              debug.debug('MapContainer ref callback:', { hasRef: !!ref, urlParams });
              setMapRef(ref);
            }}
          >
            <TileLayer
              attribution={generateAttribution()}
              url={MAP_TILE_URL}
            />
            <MapEvents onMoveEnd={handleMoveEnd} />
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