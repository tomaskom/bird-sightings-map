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
import { MapContainer, TileLayer, useMapEvents, Marker, ZoomControl, Popup } from 'react-leaflet';
import { MAP_CONTROL_STYLES } from '../styles/controls';
import { LAYOUT_STYLES } from '../styles/layout';
import { getClientId, resetClientId } from '../utils/clientTileOptimization';
import { COLORS } from '../styles/colors';
import { debug } from '../utils/debug';
import {
  DefaultIcon,
  createMultiBirdIcon,
  createNotableBirdIcon,
  initializeMapIcons,
  animateMapToLocation
} from '../utils/mapUtils';
import {
  getRegionForCoordinates
} from '../utils/regionUtils';
import { getMapParamsFromUrl, updateUrlParams } from '../utils/urlUtils';
import { 
  processBirdSightings, 
  buildViewportApiUrl, 
  fetchLocationDetails, 
  searchLocation,
  subscribeToPhotoUpdates 
} from '../utils/dataUtils';
import {
  filterSpeciesByName,
  fetchRegionSpecies,
  updateRegionCache,
  isRegionCached,
  getCachedSpecies
} from '../utils/taxonomyUtils';
import {
  MAP_TILE_URL,
  DAYS_BACK_OPTIONS,
  SPECIES_CODES,
  DEFAULT_MAP_PARAMS,
  generateAttribution,
  MAP_ZOOM_CONSTRAINTS,
  FETCH_DEBOUNCE_MS
} from '../utils/mapconstants';
import { BirdPopupContent, PopupInteractionHandler } from '../components/popups/BirdPopups';
import { LocationControl } from '../components/location/LocationControls';
import { LoadingOverlay, NavigationModeOverlay } from '../components/ui/Notifications';
import SpeciesSearch from '../components/ui/SpeciesSearch';
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
const BirdMarker = memo(({ location, icon, notableSpeciesCodes, onSpeciesSelect, mapRef }) => {
  const [isPopupOpen, setIsPopupOpen] = useState(false);
  // Use a ref to track bird photo updates without causing rerenders
  const birdPhotos = useRef({});
  const markerRef = useRef();
  const photoUnsubscribers = useRef([]);
  
  // Set up photo update subscriptions for all birds at this location
  useEffect(() => {
    // Clean up any existing subscriptions
    photoUnsubscribers.current.forEach(unsubscribe => unsubscribe());
    photoUnsubscribers.current = [];
    
    // Reset photo data when location.birds change
    birdPhotos.current = {};
    
    // Skip if no birds or no _speciesKey (indicates older data format)
    if (!location.birds || !location.birds.length || !location.birds[0]._speciesKey) {
      return;
    }
    
    // Subscribe to photo updates for each bird
    const newUnsubscribers = location.birds.map((bird, index) => {
      return subscribeToPhotoUpdates(bird, (photoData) => {
        // Store photo data in ref
        birdPhotos.current[index] = {
          thumbnailUrl: photoData.thumbnailUrl,
          fullPhotoUrl: photoData.fullPhotoUrl
        };
        
        // Force popup update if open
        if (isPopupOpen) {
          setIsPopupOpen(false);
          setTimeout(() => setIsPopupOpen(true), 0);
        }
      });
    });
    
    photoUnsubscribers.current = newUnsubscribers;
    
    // Clean up subscriptions on unmount
    return () => {
      photoUnsubscribers.current.forEach(unsubscribe => unsubscribe());
      photoUnsubscribers.current = [];
    };
  }, [location.birds, isPopupOpen]);

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

  const handleBirdSelect = useCallback((bird) => {
    if (markerRef.current && mapRef) {
      // Close the popup
      markerRef.current.closePopup();
      
      // Format selection data like the species dropdown does
      const selection = {
        speciesCode: bird.speciesCode,
        commonName: bird.comName,
        scientificName: bird.sciName
      };
      
      // Trigger the species selection
      onSpeciesSelect(selection);
    }
  }, [onSpeciesSelect, mapRef]);

  return (
    <Marker
      ref={markerRef}
      position={[location.lat, location.lng]}
      icon={icon}
      eventHandlers={eventHandlers}
    >
      <Popup 
        maxWidth={250}
        closeOnClick={true}
      >
        {isPopupOpen && (
          <BirdPopupContent 
            birds={location.birds.map((bird, index) => ({
              ...bird,
              thumbnailUrl: birdPhotos.current[index]?.thumbnailUrl || bird.thumbnailUrl,
              fullPhotoUrl: birdPhotos.current[index]?.fullPhotoUrl || bird.fullPhotoUrl
            }))} 
            notableSpeciesCodes={notableSpeciesCodes}
            onBirdSelect={handleBirdSelect}
          />
        )}
      </Popup>
    </Marker>
  );
});

BirdMarker.displayName = 'BirdMarker';

/**
 * Component that handles map events and updates
 * @param {Object} props - Component props
 * @param {Function} props.onMoveEnd - Callback for map movement end
 * @param {Function} props.onViewportChange - Callback for viewport changes
 * @param {Function} props.onDragStart - Callback when map dragging starts
 */
const MapEvents = ({ onMoveEnd, onViewportChange, onDragStart, onZoomChange }) => {
  const map = useMapEvents({
    dragstart: () => {
      debug.debug('Map drag started, closing all popups');
      map.eachLayer((layer) => {
        if (layer.getPopup && layer.getPopup()) {
          layer.closePopup();
        }
      });
      
      // Notify parent component about drag start
      if (onDragStart) {
        onDragStart();
      }
    },
    zoomend: () => {
      // Update zoom level when it changes
      const newZoom = map.getZoom();
      debug.debug('Map zoom changed:', { zoom: newZoom });
      
      // Notify parent about zoom change
      if (onZoomChange) {
        onZoomChange(newZoom);
      }
    },
    moveend: () => {
      const center = map.getCenter();
      const zoom = map.getZoom();
      debug.debug('Map move ended:', { lat: center.lat, lng: center.lng, zoom });
      
      // Update URL and call the move end handler
      onMoveEnd(center);
      updateUrlParams({
        lat: center.lat,
        lng: center.lng,
        zoom: zoom,
      });
      
      // Update which species are considered "visible" based on new viewport
      if (onViewportChange) {
        onViewportChange(map.getBounds());
      }
      
      // Also ensure zoom is updated on moveend
      if (onZoomChange) {
        onZoomChange(zoom);
      }
    }
  });
  return null;
};

/**
 * Main map component that displays bird sightings and handles user interactions
 * Manages state for map location, sightings data, search, and filtering
 * @returns {React.ReactElement} The BirdMap component
 */
const BirdMap = () => {
  // State declarations
  const [urlParams, setUrlParams] = useState(null);
  const [mapCenter, setMapCenter] = useState(null);
  const [lastFetchLocation, setLastFetchLocation] = useState(null);
  const [lastFetchParams, setLastFetchParams] = useState(null);
  const [lastFetchViewport, setLastFetchViewport] = useState(null);
  const [birdSightings, setBirdSightings] = useState([]);
  const [allBirdData, setAllBirdData] = useState(null); // Complete dataset for filtering
  const [loading, setLoading] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [currentCountry, setCurrentCountry] = useState(null);
  const [countryBounds, setCountryBounds] = useState(null);
  const [regionSpecies, setRegionSpecies] = useState([]);
  const [speciesLoading, setSpeciesLoading] = useState(false);
  const [mapRef, setMapRef] = useState(null);
  const [selectedSpecies, setSelectedSpecies] = useState(DEFAULT_MAP_PARAMS.species);
  const [back, setBack] = useState(DEFAULT_MAP_PARAMS.back);
  const [zoom, setZoom] = useState(null);
  const [isMapAnimating, setIsMapAnimating] = useState(false);
  const [visibleSpeciesCodes, setVisibleSpeciesCodes] = useState(new Set());
  const [notableSpeciesCodes, setNotableSpeciesCodes] = useState(new Set());
  const [clientId, setClientId] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isNavigationMode, setIsNavigationMode] = useState(false);
  
  // Generate a new client ID after reset
  useEffect(() => {
    setClientId(getClientId());
  }, []);
  const inputRef = useRef(null);
  const eventSourceRef = useRef(null);
  
  // Loading state manager - use this to track multiple loading operations
  const loadingStateRef = useRef(0);
  
  // Controlled methods to manage loading state
  const startLoading = useCallback(() => {
    loadingStateRef.current += 1;
    debug.debug(`Start loading operation (count: ${loadingStateRef.current})`);
    setLoading(true);
  }, []);
  
  const endLoading = useCallback(() => {
    loadingStateRef.current = Math.max(0, loadingStateRef.current - 1);
    debug.debug(`End loading operation (count: ${loadingStateRef.current})`);
    if (loadingStateRef.current === 0) {
      setLoading(false);
    }
  }, []);

  /**
   * Fetches and updates species list for the current region
   * @param {string} regionCode - Region code to fetch species for 
   */
  // In the updateRegionSpecies function:
  const updateRegionSpecies = useCallback(async (regionCode) => {
    debug.debug('updateRegionSpecies called with:', regionCode);

    if (!regionCode) {
      debug.warn('Empty region code provided to updateRegionSpecies');
      return;
    }

    const cachedSpecies = getCachedSpecies(regionCode);
    if (cachedSpecies) {
      debug.debug('Using cached species data:', { count: cachedSpecies.length });
      setRegionSpecies(cachedSpecies);
      return;
    }

    debug.info('Fetching species for new region:', regionCode);
    setSpeciesLoading(true);

    try {
      const species = await fetchRegionSpecies(regionCode);
      debug.debug('Received species data:', { count: species.length });
      updateRegionCache(regionCode, species);
      setRegionSpecies(species);
      debug.info('Updated region species:', { count: species.length });
    } catch (error) {
      debug.error('Failed to fetch region species:', error);
      setRegionSpecies([]);
    } finally {
      setSpeciesLoading(false);
    }
  }, []);

  /**
   * Process filtered data and update state with it
   * @param {Array} filteredData - Bird data filtered by species
   * @returns {Promise<void>} Promise that resolves when processing is complete
   */
  const processAndDisplayFilteredData = useCallback(async (filteredData) => {
    const startTime = Date.now();
    try {
      // Process the filtered data
      const processedSightings = await processBirdSightings(filteredData);
      
      // Get the current visible viewport bounds
      const bounds = mapRef.getBounds();
      const visibleBounds = {
        minLat: bounds.getSouth(),
        maxLat: bounds.getNorth(),
        minLng: bounds.getWest(),
        maxLng: bounds.getEast()
      };
      
      // Extract visible species codes - these are species actually visible in the current viewport
      // This is used by the SpeciesSearch component to show which birds are currently "on map"
      const currentVisibleSpecies = new Set();
      processedSightings.forEach(location => {
        // Check if this location is within the visible bounds
        const isLocationVisible = 
          location.lat >= visibleBounds.minLat && 
          location.lat <= visibleBounds.maxLat &&
          location.lng >= visibleBounds.minLng && 
          location.lng <= visibleBounds.maxLng;
        
        // Only add species from visible locations
        if (isLocationVisible) {
          location.birds.forEach(bird => {
            if (bird.speciesCode) {
              currentVisibleSpecies.add(bird.speciesCode);
            }
          });
        }
      });
      
      // Extract notable species codes - only for display in the species filter
      // Do NOT use this for determining which birds to mark as notable in the UI
      const currentNotableSpecies = new Set();
      filteredData.forEach(bird => {
        // Add to notable species set ONLY if the bird is actually from the notable API endpoint
        if (bird.isNotable && bird.speciesCode) {
          currentNotableSpecies.add(bird.speciesCode);
        }
      });
      
      debug.info('Processed filtered data:', {
        sightingLocations: processedSightings.length,
        visibleSpecies: currentVisibleSpecies.size,
        visibleSpeciesSample: Array.from(currentVisibleSpecies).slice(0, 3),
        notableSpecies: currentNotableSpecies.size,
        processingTime: `${Date.now() - startTime}ms`
      });
      
      // Update state - this ensures the species search dropdown shows exactly what's in the viewport
      setVisibleSpeciesCodes(currentVisibleSpecies);
      setNotableSpeciesCodes(currentNotableSpecies);
      setBirdSightings(processedSightings);
    } catch (error) {
      debug.error('Error processing filtered data:', error);
      // Re-throw to allow caller to handle errors
      throw error;
    } finally {
      // Always end the loading operation, regardless of success or failure
      endLoading();
    }
  }, [mapRef, endLoading, setBirdSightings, setVisibleSpeciesCodes, setNotableSpeciesCodes]);

  /**
   * Unified handler for filter changes (species or days)
   * @param {string} filterType - Type of filter ('species' or 'days')
   * @param {any} newValue - New value for the filter
   */
  const handleFilterChange = useCallback((filterType, newValue) => {
    debug.debug(`Filter changed: ${filterType} = ${newValue}`);
    
    // Extract species code from selection object if needed
    let speciesCode, daysValue;
    
    if (filterType === 'species') {
      // For species filter, the newValue is a selection object with type or speciesCode
      speciesCode = newValue.type || newValue.speciesCode;
      daysValue = back; // Use current days value
      
      // Skip if species hasn't changed
      if (speciesCode === selectedSpecies) {
        debug.debug('Species already selected, no change needed');
        return;
      }
    } else if (filterType === 'days') {
      // For days filter, the newValue is the days value directly
      daysValue = newValue;
      speciesCode = selectedSpecies; // Use current species value
      
      // Skip if days hasn't changed
      if (daysValue === back) {
        debug.debug('Days already set to this value, no change needed');
        return;
      }
    } else {
      debug.error('Invalid filter type:', filterType);
      return;
    }
    
    // Close any open popups when changing filters
    if (mapRef) {
      mapRef.closePopup();
    }
    
    // Update the URL parameters
    if (mapRef) {
      updateUrlParams(
        filterType === 'species' 
          ? { species: speciesCode } 
          : { back: daysValue }
      );
    }
    
    // Filter with new values directly if we have data
    if (mapRef && allBirdData) {
      startLoading();
      try {
        // Apply filtering with both filters
        const filteredData = filterAllBirdData(allBirdData, daysValue, speciesCode);
        
        debug.info(`Filtered to ${filteredData.length} birds with days=${daysValue} and species=${speciesCode}`);
        
        // Process and display the filtered data
        processAndDisplayFilteredData(filteredData)
          .catch(error => {
            debug.error('Error processing filtered data:', error);
          })
          .finally(() => {
            // Update state AFTER processing the data
            if (filterType === 'species') {
              setSelectedSpecies(speciesCode);
            } else {
              setBack(daysValue);
            }
            
            // Update lastFetchParams to avoid refiltering
            if (lastFetchParams) {
              setLastFetchParams({
                ...lastFetchParams,
                species: speciesCode,
                back: daysValue
              });
            }
            endLoading();
          });
      } catch (error) {
        debug.error(`Error filtering by ${filterType}:`, error);
        // Still update the state even on error
        if (filterType === 'species') {
          setSelectedSpecies(speciesCode);
        } else {
          setBack(daysValue);
        }
        endLoading();
      }
    } else {
      // If we don't have data yet, just update the state
      if (filterType === 'species') {
        setSelectedSpecies(speciesCode);
        // No data yet - need to refetch
        setLastFetchParams(null); // Force refetch with new species
      } else {
        setBack(daysValue);
      }
    }
  }, [mapRef, allBirdData, selectedSpecies, back, lastFetchParams, 
      startLoading, endLoading, processAndDisplayFilteredData]);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchInput.trim() || !mapRef) return;
  
    debug.debug('Initiating location search for:', searchInput);
  
    // Close any open popups before starting the search
    mapRef.closePopup();
  
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
      const data = await searchLocation(searchInput);
  
      if (data.found) {
        debug.info('Location found:', data);
        
        // Use the centralized animation utility
        animateMapToLocation(
          mapRef,
          [data.lat, data.lon],
          13,
          setIsMapAnimating,
          handleMoveEnd
        );
        
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

  /**
   * Filter all bird data by days and species
   * @param {Array} birds - Bird data to filter
   * @param {string} daysValue - Days back to filter by
   * @param {string} speciesCode - Species code to filter by
   * @returns {Array} Filtered data matching both criteria
   */
  const filterAllBirdData = useCallback((birds, daysValue, speciesCode) => {
    if (!birds || birds.length === 0) return [];
    
    // First filter by days
    const backDaysNum = parseInt(daysValue, 10);
    let filtered = birds;
    
    if (!isNaN(backDaysNum) && backDaysNum > 0) {
      // Calculate cutoff date based on selected "back" value
      const cutoffDate = new Date();
      cutoffDate.setHours(0, 0, 0, 0);
      cutoffDate.setDate(cutoffDate.getDate() - backDaysNum);
      
      debug.info(`Filtering to last ${backDaysNum} days (since ${cutoffDate.toISOString().split('T')[0]})`);
          
      // Filter birds by observation date
      filtered = filtered.filter(bird => {
        if (!bird.obsDt) return false;
        const obsDate = new Date(bird.obsDt);
        obsDate.setHours(0, 0, 0, 0);
        return obsDate >= cutoffDate;
      });
      
      debug.debug(`Date filtering applied, ${filtered.length} birds remain`);
    }
    
    // Then filter by species
    if (speciesCode === SPECIES_CODES.ALL) {
      // No additional filtering needed
    } else if (speciesCode === SPECIES_CODES.RARE) {
      filtered = filtered.filter(bird => bird.isNotable);
    } else {
      filtered = filtered.filter(bird => bird.speciesCode === speciesCode);
    }
    
    debug.info(`Filtered to ${filtered.length} birds with days=${daysValue} and species=${speciesCode}`);
        
    return filtered;
  }, []);
  
  /**
   * Checks if the new viewport is contained within the old viewport
   * or if they're effectively the same.
   * @param {Object} oldViewport - Previously fetched viewport
   * @param {Object} newViewport - Current viewport
   * @returns {boolean} True if new viewport is contained within old or they're the same
   */
  const isViewportContained = (oldViewport, newViewport) => {
    if (!oldViewport || !newViewport) return false;
    
    // No need to check back days since we filter client-side now
    // Just focus on the geographic viewport
    
    // Check if new viewport is fully contained within old viewport
    // Add a small buffer (0.001 degrees) to account for floating point precision
    const buffer = 0.001;
    
    const isContained = 
      newViewport.minLat >= (oldViewport.minLat - buffer) &&
      newViewport.maxLat <= (oldViewport.maxLat + buffer) &&
      newViewport.minLng >= (oldViewport.minLng - buffer) &&
      newViewport.maxLng <= (oldViewport.maxLng + buffer);
    
    if (isContained) {
      debug.info('🔍 New viewport is contained within old viewport, using cached data');
    }
    
    return isContained;
  };
  

  /**
   * Handles map movement events, updates center position and detects region changes
   * @param {L.LatLng} center - New center coordinates of the map
   */

  /**
   * Calculates the viewport areas that need to be fetched by comparing with lastFetchViewport
   * @param {Object} newViewport - New viewport bounds
   * @param {Object} lastViewport - Previously fetched viewport
   * @returns {Array} Array of viewport segments that need to be fetched, or null if complete refetch needed
   */
  const getViewportSegmentsToFetch = useCallback((newViewport, lastViewport) => {
    // If no previous viewport or days back changed, need to fetch everything
    if (!lastViewport || lastViewport.back !== newViewport.back) {
      return null;
    }
    
    // Check if there's any overlap between viewports
    const hasOverlap = 
      newViewport.minLat <= lastViewport.maxLat &&
      newViewport.maxLat >= lastViewport.minLat &&
      newViewport.minLng <= lastViewport.maxLng &&
      newViewport.maxLng >= lastViewport.minLng;
    
    // If no overlap, need to fetch the entire new viewport
    if (!hasOverlap) {
      debug.debug("No overlap with previous viewport, fetching entire new viewport");
      return null;
    }
    
    // Calculate overlap region
    const overlapViewport = {
      minLat: Math.max(newViewport.minLat, lastViewport.minLat),
      maxLat: Math.min(newViewport.maxLat, lastViewport.maxLat),
      minLng: Math.max(newViewport.minLng, lastViewport.minLng),
      maxLng: Math.min(newViewport.maxLng, lastViewport.maxLng),
      back: newViewport.back
    };
    
    // Calculate segments that need to be fetched (regions outside the overlap)
    const segments = [];
    
    // North segment (if any)
    if (newViewport.maxLat > lastViewport.maxLat) {
      segments.push({
        minLat: lastViewport.maxLat,
        maxLat: newViewport.maxLat,
        minLng: newViewport.minLng,
        maxLng: newViewport.maxLng,
        back: newViewport.back
      });
      debug.debug("Adding north segment to fetch");
    }
    
    // South segment (if any)
    if (newViewport.minLat < lastViewport.minLat) {
      segments.push({
        minLat: newViewport.minLat,
        maxLat: lastViewport.minLat,
        minLng: newViewport.minLng,
        maxLng: newViewport.maxLng,
        back: newViewport.back
      });
      debug.debug("Adding south segment to fetch");
    }
    
    // East segment (excluding parts covered by north/south segments)
    if (newViewport.maxLng > lastViewport.maxLng) {
      segments.push({
        minLat: Math.max(newViewport.minLat, lastViewport.minLat),
        maxLat: Math.min(newViewport.maxLat, lastViewport.maxLat),
        minLng: lastViewport.maxLng,
        maxLng: newViewport.maxLng,
        back: newViewport.back
      });
      debug.debug("Adding east segment to fetch");
    }
    
    // West segment (excluding parts covered by north/south segments)
    if (newViewport.minLng < lastViewport.minLng) {
      segments.push({
        minLat: Math.max(newViewport.minLat, lastViewport.minLat),
        maxLat: Math.min(newViewport.maxLat, lastViewport.maxLat),
        minLng: newViewport.minLng,
        maxLng: lastViewport.minLng,
        back: newViewport.back
      });
      debug.debug("Adding west segment to fetch");
    }
    
    debug.info(`Generated ${segments.length} viewport segments to fetch`);
    return segments.length > 0 ? segments : null;
  }, []);

  /**
   * Handles updates needed when the viewport bounds change
   * Updates the visible species based on what's actually in view 
   * @param {L.LatLngBounds} bounds - The current map bounds
   */
  const handleViewportChange = useCallback((bounds) => {
    // If we don't have any bird data yet, nothing to update
    if (!birdSightings || birdSightings.length === 0) return;
    
    // Get the bounds
    const visibleBounds = {
      minLat: bounds.getSouth(),
      maxLat: bounds.getNorth(),
      minLng: bounds.getWest(),
      maxLng: bounds.getEast()
    };
    
    // Check which species are actually visible in the viewport
    const visibleInViewport = new Set();
    birdSightings.forEach(location => {
      // Check if this location is within the visible bounds
      const isLocationVisible = 
        location.lat >= visibleBounds.minLat && 
        location.lat <= visibleBounds.maxLat &&
        location.lng >= visibleBounds.minLng && 
        location.lng <= visibleBounds.maxLng;
      
      // Only add species from visible locations
      if (isLocationVisible) {
        location.birds.forEach(bird => {
          if (bird.speciesCode) {
            visibleInViewport.add(bird.speciesCode);
          }
        });
      }
    });
    
    // Update the visible species codes
    debug.info('Viewport changed, updating visible species:', {
      previousCount: visibleSpeciesCodes.size,
      newCount: visibleInViewport.size
    });
    
    setVisibleSpeciesCodes(visibleInViewport);
  }, [birdSightings, visibleSpeciesCodes]);
  
  // Timer ref for debouncing fetch requests
  const fetchTimerRef = useRef(null);
  // State to trigger fetches
  const [shouldFetch, setShouldFetch] = useState(false);

  /**
   * Handles zoom level changes and updates navigation mode
   * @param {number} newZoom - New zoom level
   */
  const handleZoomChange = useCallback((newZoom) => {
    setZoom(newZoom);
    
    // Check if we should be in navigation mode (below threshold)
    const shouldBeNavigationMode = newZoom < MAP_ZOOM_CONSTRAINTS.FETCH_THRESHOLD;
    
    // Only update if the state is changing
    if (shouldBeNavigationMode !== isNavigationMode) {
      debug.info(`${shouldBeNavigationMode ? 'Entering' : 'Exiting'} navigation mode at zoom level ${newZoom}`);
      setIsNavigationMode(shouldBeNavigationMode);
      
      // If exiting navigation mode and we have a map reference, trigger a data fetch
      if (!shouldBeNavigationMode && mapRef) {
        setShouldFetch(true);
      }
    }
  }, [mapRef, isNavigationMode]);

  const handleMoveEnd = useCallback((center) => {
    debug.debug('Map move ended at:', { lat: center.lat, lng: center.lng, isAnimating: isMapAnimating, isDragging });
    setMapCenter({ lat: center.lat, lng: center.lng });
    
    // Reset dragging state if it was set
    if (isDragging) {
      setIsDragging(false);
    }

    // Skip region check if the map is currently animating (during flyTo)
    if (isMapAnimating) {
      debug.debug('Skipping region check during map animation');
      return;
    }
    
    // Skip fetch if in navigation mode (below zoom threshold)
    if (isNavigationMode) {
      debug.debug('In navigation mode, skipping data fetch');
      return;
    }

    // Clear any existing timer
    if (fetchTimerRef.current) {
      debug.debug('Clearing existing fetch timer');
      clearTimeout(fetchTimerRef.current);
    }

    // Check for region changes using the new region detection logic
    const updateRegion = async () => {
      try {
        // Get region info for current coordinates
        const regionInfo = await getRegionForCoordinates(center.lat, center.lng);
        
        if (!regionInfo) {
          debug.warn('Could not determine region for coordinates');
          return;
        }
        
        const regionCode = regionInfo.subregion?.code || regionInfo.country.code;
        
        // Check if region has changed
        if (regionCode !== currentCountry) {
          debug.info('Region changed:', {
            from: currentCountry,
            to: regionCode,
            hasSubregion: !!regionInfo.subregion
          });
          
          // Update state with new region information
          setCurrentCountry(regionCode);
          
          // If we have a subregion, use its bounds, otherwise use country bounds
          if (regionInfo.subregion) {
            debug.debug('Using subregion bounds');
            // TODO: Store and use subregion bounds when implementing full subregion support
          } else if (regionInfo.country) {
            debug.debug('Using country bounds');
            // For backward compatibility, we're still using countryBounds for now
            // This will be updated when full subregion support is implemented
          }
          
          // Fetch species for the new region
          debug.debug('Initiating species fetch for region:', regionCode);
          await updateRegionSpecies(regionCode);
          debug.debug('Completed species fetch');
          
          // Force data refetch with new region - use immediate fetch for region changes
          setLastFetchParams(null);
          debug.debug('Region changed, using immediate fetch');
          setShouldFetch(true); // This will trigger fetch via the useEffect
          return; // Skip the debounced fetch
        }
      } catch (error) {
        debug.error('Error updating region:', error);
      }
      
      // If we get here, region hasn't changed, use debounced fetch
      debug.debug(`Scheduling fetch with ${FETCH_DEBOUNCE_MS}ms debounce`);
      
      // Set up the debounced fetch timer
      fetchTimerRef.current = setTimeout(() => {
        debug.debug('Debounce timer completed, triggering fetch');
        setShouldFetch(true);
        fetchTimerRef.current = null;
      }, FETCH_DEBOUNCE_MS);
    };
    
    // Check for region changes - our new utility handles caching internally
    updateRegion();
  }, [currentCountry, updateRegionSpecies, isMapAnimating, isDragging]);


  /**
   * Fetches bird sighting data for a specific viewport segment
   * @async
   * @param {Object} viewport - Viewport segment parameters
   * @returns {Promise<Array>} Bird data for the segment
   */
  const fetchViewportSegment = useCallback(async (viewport) => {
    // Create the viewport API URL with clientId for SSE notifications
    const apiParams = {
      ...viewport,
      clientId: clientId // Include clientId for server notifications
    };
    const apiUrl = buildViewportApiUrl(apiParams);
    
    debug.info('Fetching segment data:', {
      viewport
    });
    
    const response = await fetch(apiUrl);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    return await response.json();
  }, [clientId]);

  /**
   * Adds new bird data to existing collection, replacing data for tiles that are updated
   * @param {Array} existingData - Existing bird data
   * @param {Array} newData - New bird data to add
   * @param {Array} updatedTileIds - Tile IDs that were updated in this batch
   * @returns {Array} Combined bird data with updates applied
   */
  const addNewBirdData = useCallback((existingData, newData, updatedTileIds) => {
    // If either array is empty, handle the simple cases
    if (!existingData || existingData.length === 0) return newData;
    if (!newData || newData.length === 0) return existingData;
    
    debug.info(`Processing ${newData.length} birds for ${updatedTileIds?.length || 0} updated tiles`);
    
    // Create a set of tile IDs for efficient lookup
    const tileSet = new Set(updatedTileIds);
    
    // Remove existing birds that belong to updated tiles
    const filteredExisting = existingData.filter(bird => {
      // If the bird has a tileId and that tile was updated, remove it
      return !(bird._tileId && tileSet.has(bird._tileId));
    });
    
    // Combine filtered existing with new data
    const result = [...filteredExisting, ...newData];
    
    debug.info(`Replaced data for ${updatedTileIds.length} tiles, collection now has ${result.length} birds`);
    
    return result;
  }, []);

  /**
   * Fetches bird sighting data based on current map viewport
   * @async
   */
  const fetchBirdData = useCallback(async () => {
    if (!mapRef) return;
    
    // Get current map bounds
    const bounds = mapRef.getBounds();
    const ne = bounds.getNorthEast();
    const sw = bounds.getSouthWest();
    
    // Create new viewport parameters
    const currentViewport = {
      minLat: sw.lat,
      maxLat: ne.lat,
      minLng: sw.lng,
      maxLng: ne.lng,
      back
    };
    
    // Check if we already have data for this viewport (or if it's zoomed in)
    if (isViewportContained(lastFetchViewport, currentViewport) && allBirdData) {
      debug.debug('Viewport is contained within last fetch, reusing data');
      
      // Filter the existing data by species if needed
      if (selectedSpecies !== lastFetchParams?.species) {
        debug.debug('Filtering existing data for new species selection:', selectedSpecies);
        
        // Start a loading operation for filtering
        startLoading();
        
        // Filter data
        const filteredData = filterAllBirdData(allBirdData, back, );
        
        // Process filtered data (the function handles endLoading internally)
        startLoading(); // Add another loading operation for the processing stage
        processAndDisplayFilteredData(filteredData)
          .catch(error => {
            debug.error('Error processing filtered data:', error);
            // Loading state is cleared in the function
          })
          .finally(() => {
            // End the loading operation for the filtering stage
            endLoading();
          });
        
        // Update last fetch params to avoid refiltering
        setLastFetchParams({
          ...lastFetchParams,
          species: selectedSpecies
        });
      }
      
      return;
    }
    
    // With server-side client tracking, we no longer need to calculate segments
    // The server will determine which tiles to send based on client history
    
    startLoading();
    
    try {
      let data;
      
      // With server-side client tile tracking, we just need a simple fetch that always
      // sends the clientId. The server will only return tiles we don't have.
      debug.info('Fetching bird data for viewport');
      
      // Create the viewport API URL with clientId
      const apiParams = {
        ...currentViewport,
        clientId: clientId
      };
      const apiUrl = buildViewportApiUrl(apiParams);
      
      debug.info('Fetching bird data:', {
        viewport: currentViewport
      });
      
      const response = await fetch(apiUrl);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      // Get new bird data from server
      const newData = await response.json();
      debug.info(`Received ${newData.length} new birds from server`);
      
      // Extract unique tile IDs from the new data for replacement
      const updatedTileIds = Array.from(new Set(
        newData
          .filter(bird => bird._tileId) // Only include birds with tile IDs
          .map(bird => bird._tileId)    // Extract the tile IDs
      ));
      
      debug.info(`Received data for ${updatedTileIds.length} unique tiles`);
      
      // Add new data to existing collection, replacing any data for updated tiles
      data = addNewBirdData(allBirdData || [], newData, updatedTileIds);
      
      debug.info(`Bird collection now contains ${data.length} total birds`); 
      
      // Store complete data set for client-side filtering
      setAllBirdData(data);
      setLastFetchViewport(currentViewport);
      
      // Filter the data by current species selection
      const filteredData = filterAllBirdData(data, back, selectedSpecies);
      
      // Process and display the data - note: this function handles endLoading internally
      startLoading(); // Add another loading operation for the processing stage
      await processAndDisplayFilteredData(filteredData);
      
      // Update last fetch parameters
      setLastFetchParams({ 
        back, 
        species: selectedSpecies,
        region: currentCountry 
      });
    } catch (error) {
      debug.error('Error fetching bird data:', error);
      alert('Error fetching bird sightings');
    } finally {
      endLoading(); // End the loading operation for the fetch itself
    }
  }, [mapRef, back, selectedSpecies, lastFetchViewport, lastFetchParams, allBirdData, startLoading, endLoading, isViewportContained, filterAllBirdData, processAndDisplayFilteredData, currentCountry, addNewBirdData, clientId]);
  

  // Cleanup any pending timers when unmounting
  useEffect(() => {
    return () => {
      if (fetchTimerRef.current) {
        clearTimeout(fetchTimerRef.current);
      }
    };
  }, []);

  // Effect to trigger data fetch when parameters change
  useEffect(() => {
    debug.debug('Fetch effect running with:', {
      loading,
      mapCenter,
      selectedSpecies,
      back,
      zoom,
      hasMapRef: !!mapRef,
      shouldFetch,
      hasAllBirdData: !!allBirdData,
      isNavigationMode
    });
    
    // Skip fetching if in navigation mode
    if (isNavigationMode) {
      debug.debug('In navigation mode, skipping fetch effect');
      return;
    }
    
    // Handle filter changes with local filtering when we have cached data
    if (!loading && mapCenter && selectedSpecies && back && zoom && mapRef && 
        lastFetchParams && allBirdData) {
      
      if (lastFetchParams.species !== selectedSpecies || lastFetchParams.back !== back) {
        debug.debug('Filter changed, using local data filtering (no fetch)');
        
        // Start a loading operation for the filtering process
        startLoading();
        
        try {
          // Apply local filtering to existing data
          const filteredData = filterAllBirdData(allBirdData, back, selectedSpecies);
          
          // Process and display the filtered data
          processAndDisplayFilteredData(filteredData)
            .catch(error => {
              debug.error('Error processing filtered data:', error);
            });
          
          // Update last fetch params to avoid refiltering
          setLastFetchParams({
            ...lastFetchParams,
            species: selectedSpecies,
            back: back
          });
        } catch (error) {
          debug.error('Error during local filtering:', error);
          endLoading();
        }
        return;
      }
    }
    
    // For filter changes when we don't have cached data, or for any other reason we need data
    // (map movement, initial load), perform a fetch
    if (shouldFetch && !loading && mapRef && !isNavigationMode) {
      debug.debug('Executing fetch from debounce timer or initial load');
      setShouldFetch(false); // Reset the trigger
      fetchBirdData();
    }
  }, [back, selectedSpecies, mapCenter, zoom, mapRef, loading, fetchBirdData, lastFetchParams, shouldFetch, 
      allBirdData, filterAllBirdData, processAndDisplayFilteredData, startLoading, endLoading, isNavigationMode]);
  
  // This effect is no longer needed as we handle filter changes 
  // directly in the main fetch effect above to avoid duplicate handling
  // If we still need this for other cases, we can reimplement it

  // Set up SSE for tile update notifications - DISABLED FOR CLIENT TILE OPTIMIZATION
  useEffect(() => {
    // SSE connection is disabled because we now use client-side tile tracking
    // This eliminates the need for real-time server notifications
    debug.info('SSE connection disabled - using client-side tile tracking instead');
    
    // No cleanup needed since we're not setting up anything
    return () => {};
  }, [clientId]);
  
  /**
   * Handles tile update notifications from the server via SSE
   * Refreshes the map with new data from background-loaded tiles
   * @param {Object} updateData - Data about the tile update
   */
  const handleTileUpdate = useCallback((updateData) => {
    debug.info('Received tile update:', { 
      completedTiles: updateData.completedTileIds.length,
      isComplete: updateData.isComplete || false
    });
    
    // If this update doesn't match our current viewport, ignore it
    if (lastFetchViewport && updateData.viewport) {
      const viewportChanged = 
        Math.abs(lastFetchViewport.minLat - updateData.viewport.minLat) > 0.001 ||
        Math.abs(lastFetchViewport.maxLat - updateData.viewport.maxLat) > 0.001 ||
        Math.abs(lastFetchViewport.minLng - updateData.viewport.minLng) > 0.001 ||
        Math.abs(lastFetchViewport.maxLng - updateData.viewport.maxLng) > 0.001;
      
      if (viewportChanged) {
        debug.debug('Ignoring tile update for different viewport');
        return;
      }
    }
    
    // Check if our map is ready
    if (!mapRef) {
      debug.debug('Map not ready, ignoring tile update');
      return;
    }
    
    // Force a re-fetch by creating a simulated map center change
    debug.info('Background tiles loaded, refreshing map data');
    
    // Get current bounds
    const bounds = mapRef.getBounds();
    const ne = bounds.getNorthEast();
    const sw = bounds.getSouthWest();
    
    // Create new viewport parameters
    const currentViewport = {
      minLat: sw.lat,
      maxLat: ne.lat,
      minLng: sw.lng,
      maxLng: ne.lng,
      back
    };
    
    // Reset the last fetch viewport to force a fresh data fetch
    setLastFetchViewport(null);
    
    // Use a small timeout to ensure the state update happens
    setTimeout(() => {
      // Get bird data for the current viewport
      const apiParams = {
        ...currentViewport,
        clientId: clientId
      };
      
      const apiUrl = buildViewportApiUrl(apiParams);
      
      // Manual fetch to bypass caching
      debug.info('Manually refreshing data with background tiles');
      fetch(apiUrl)
        .then(response => {
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
          return response.json();
        })
        .then(data => {
          // Clear previous data completely before setting new data
          // This ensures we don't accumulate duplicates
          debug.info(`Replacing data with ${data.length} birds from updated tiles`);
          
          // Important: Directly set the new data instead of merging with old data
          setAllBirdData(data);
          setLastFetchViewport(currentViewport);
          
          // Filter by current species
          const filteredData = filterAllBirdData(data, back, selectedSpecies);
          
          // Process and display
          processAndDisplayFilteredData(filteredData);
          
          debug.info('Map refreshed with background tile data:', {
            birds: data.length,
            filtered: filteredData.length
          });
        })
        .catch(error => {
          debug.error('Error refreshing map with background tiles:', error);
        });
    }, 100);
  }, [mapRef, lastFetchViewport, fetchBirdData, clientId, back, setLastFetchViewport, filterAllBirdData, processAndDisplayFilteredData, buildViewportApiUrl]);
  
  // Load URL parameters on component mount and reset client tracking
  useEffect(() => {
    // Reset client ID on page reload to force a fresh state
    resetClientId();
    debug.info('Reset client ID on page load');
    
    const loadUrlParams = async () => {
      try {
        debug.debug('Loading URL parameters');
        const params = await getMapParamsFromUrl();
        setUrlParams(params);
        setMapCenter({ lat: params.lat, lng: params.lng });
        setSelectedSpecies(params.species);
        setBack(params.back);
        setZoom(params.zoom);
        
        // Initialize navigation mode based on initial zoom level
        const initialNavigationMode = params.zoom < MAP_ZOOM_CONSTRAINTS.FETCH_THRESHOLD;
        setIsNavigationMode(initialNavigationMode);
        debug.info(`Initial navigation mode: ${initialNavigationMode ? 'ON' : 'OFF'} at zoom level ${params.zoom}`);

        // Get initial region info using our new utility
        try {
          const regionInfo = await getRegionForCoordinates(params.lat, params.lng);
          debug.debug('Received region info:', regionInfo);
          
          if (regionInfo) {
            const regionCode = regionInfo.subregion?.code || regionInfo.country.code;
            debug.debug('Setting initial region:', regionCode);
            setCurrentCountry(regionCode);
            
            // Get cached species if available, otherwise fetch new
            const cachedSpecies = getCachedSpecies(regionCode);
            if (cachedSpecies) {
              debug.debug('Using cached species data:', { count: cachedSpecies.length });
              setRegionSpecies(cachedSpecies);
            } else {
              await updateRegionSpecies(regionCode);
            }
          }
        } catch (error) {
          debug.error('Error getting initial country:', error);
        }

      setLastFetchParams(null);
      debug.info('URL parameters loaded:', params);
      
      // Trigger initial fetch once parameters are loaded (only if not in navigation mode)
      if (!initialNavigationMode) {
        debug.info('Triggering initial fetch after URL parameters load');
        setShouldFetch(true);
      } else {
        debug.info('Skipping initial fetch due to navigation mode');
      }
    } catch (error) {
      debug.error('Error loading URL parameters:', error);
    }
  };
  loadUrlParams();
}, [updateRegionSpecies]);


  return (
    <div style={LAYOUT_STYLES.container}>
      <div style={LAYOUT_STYLES.controlsWrapper}>
        <div style={LAYOUT_STYLES.controlGroup}>

          <SpeciesSearch
            onSpeciesSelect={(selection) => handleFilterChange('species', selection)}
            disabled={loading || speciesLoading}
            currentCountry={currentCountry}
            regionSpecies={regionSpecies}
            speciesLoading={speciesLoading}
            speciesCode={selectedSpecies}
            allSpeciesCode={SPECIES_CODES.ALL}
            rareSpeciesCode={SPECIES_CODES.RARE}
            visibleSpeciesCodes={visibleSpeciesCodes}
            notableSpeciesCodes={notableSpeciesCodes}
          />

          <div style={LAYOUT_STYLES.pullDown}>
            <span style={{ color: COLORS.text.primary }}>Last</span>
            <select
              value={back}
              onChange={(e) => handleFilterChange('days', e.target.value)}
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
            minZoom={MAP_ZOOM_CONSTRAINTS.MIN_ZOOM}
            maxZoom={MAP_ZOOM_CONSTRAINTS.MAX_ZOOM}
            style={{
              ...LAYOUT_STYLES.map,
              cursor: isNavigationMode ? (isDragging ? 'grabbing' : 'grab') : 'auto'
            }}
            zoomControl={false}
            ref={(ref) => {
              debug.debug('MapContainer ref callback:', { hasRef: !!ref, urlParams });
              setMapRef(ref);
            }}
          >
            <TileLayer
              attribution={generateAttribution()}
              url={MAP_TILE_URL}
            />
            <MapEvents 
              onMoveEnd={handleMoveEnd} 
              onViewportChange={handleViewportChange}
              onZoomChange={handleZoomChange}
              onDragStart={() => {
                setIsDragging(true);
                // Cancel any pending fetch timer when starting a new drag
                if (fetchTimerRef.current) {
                  clearTimeout(fetchTimerRef.current);
                  fetchTimerRef.current = null;
                }
              }}
            />
            <PopupInteractionHandler />
            <ZoomControl position="topright" />
            <LocationControl 
              setIsMapAnimating={setIsMapAnimating} 
              onAnimationComplete={handleMoveEnd} 
            />
            {!isNavigationMode && birdSightings.map((location) => (
              <BirdMarker
                key={`${location.lat}-${location.lng}`}
                location={location}
                icon={location.birds.length > 1 
                  ? createMultiBirdIcon(
                      location.birds.length, 
                      location.birds.some(bird => bird.isNotable)
                    ) 
                  : (location.birds.length === 1 && location.birds[0].isNotable)
                    ? createNotableBirdIcon()
                    : DefaultIcon}
                notableSpeciesCodes={notableSpeciesCodes}
                onSpeciesSelect={handleFilterChange}
                mapRef={mapRef}
              />
            ))}
            {loading && <LoadingOverlay />}
            {isNavigationMode && <NavigationModeOverlay />}
          </MapContainer>
        )}
      </div>
    </div>
  );
};

export default BirdMap;