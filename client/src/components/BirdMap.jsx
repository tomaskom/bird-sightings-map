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
  MAP_ZOOM_CONSTRAINTS
} from '../utils/mapconstants';
import { BirdPopupContent, PopupInteractionHandler } from '../components/popups/BirdPopups';
import { LocationControl } from '../components/location/LocationControls';
import { LoadingOverlay } from '../components/ui/Notifications';
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
  const [birds, setBirds] = useState(location.birds);
  const markerRef = useRef();
  const photoUnsubscribers = useRef([]);
  
  // Set up photo update subscriptions for all birds at this location
  useEffect(() => {
    // Clean up any existing subscriptions
    photoUnsubscribers.current.forEach(unsubscribe => unsubscribe());
    photoUnsubscribers.current = [];
    
    // Skip if no birds or no _speciesKey (indicates older data format)
    if (!location.birds || !location.birds.length || !location.birds[0]._speciesKey) {
      return;
    }
    
    // Subscribe to photo updates for each bird
    const newUnsubscribers = location.birds.map((bird, index) => {
      return subscribeToPhotoUpdates(bird, (photoData) => {
        // Update the bird with new photo data
        setBirds(currentBirds => {
          const newBirds = [...currentBirds];
          newBirds[index] = {
            ...newBirds[index],
            thumbnailUrl: photoData.thumbnailUrl,
            fullPhotoUrl: photoData.fullPhotoUrl
          };
          return newBirds;
        });
      });
    });
    
    photoUnsubscribers.current = newUnsubscribers;
    
    // Clean up subscriptions on unmount
    return () => {
      photoUnsubscribers.current.forEach(unsubscribe => unsubscribe());
      photoUnsubscribers.current = [];
    };
  }, [location.birds]);

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
            birds={birds} 
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
 */
const MapEvents = ({ onMoveEnd, onViewportChange }) => {
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
  const inputRef = useRef(null);
  
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
   * Handles selection of a bird species from the search component
   * @param {Object} selection - The selected species object
   * @param {string} [selection.type] - Type for special filters (rare/recent)
   * @param {string} [selection.speciesCode] - Species code for specific birds
   */
  const handleSpeciesSelect = useCallback((selection) => {
    debug.debug('Species selected:', selection);
    // The selection object contains either a type (for pinned options) 
    // or a speciesCode (for specific birds)
    const speciesCode = selection.type || selection.speciesCode;
    
    if (speciesCode === selectedSpecies) {
      debug.debug('Species already selected, no change needed');
      return;
    }

    // Close any open popups when changing species filter
    if (mapRef) {
      mapRef.closePopup();
    }

    setSelectedSpecies(speciesCode);
    
    if (mapRef) {
      updateUrlParams({
        species: speciesCode
      });
      
      // Filter data locally without refetching
      if (allBirdData) {
        // Update last fetch params, but don't clear the viewport data
        setLastFetchParams({
          ...lastFetchParams,
          species: speciesCode
        });
        
        debug.info('🔄 Filtering existing viewport data for new species:', speciesCode);
        // We'll handle the filtering in the useEffect
      } else {
        // No data yet - need to refetch
        setLastFetchParams(null); // Force refetch with new species
      }
    }
  }, [mapRef, allBirdData, selectedSpecies, lastFetchParams]);

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
          12,
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

  const handleDaysChange = (e) => {
    const newDays = e.target.value;
    debug.debug('Changing days back to:', newDays);
    
    // Close any open popups when changing days filter
    if (mapRef) {
      mapRef.closePopup();
    }
    
    setBack(newDays);
    if (mapRef) {
      updateUrlParams({
        back: newDays,
      });
      setLastFetchParams(null); // Force refetch with new days
      setLastFetchViewport(null); // Force refetch with new days
    }
  };
  
  /**
   * Checks if the new viewport is contained within the old viewport
   * or if they're effectively the same.
   * @param {Object} oldViewport - Previously fetched viewport
   * @param {Object} newViewport - Current viewport
   * @returns {boolean} True if new viewport is contained within old or they're the same
   */
  const isViewportContained = (oldViewport, newViewport) => {
    if (!oldViewport || !newViewport) return false;
    
    // If days changed, we need to refetch
    if (oldViewport.back !== newViewport.back) return false;
    
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
   * Filters bird data based on selected species type
   * @param {Array} allBirds - Complete bird data from server
   * @param {string} speciesCode - Selected species code or filter type
   * @returns {Array} Filtered bird data
   */
  const filterBirdDataBySpecies = (allBirds) => {
    if (!allBirds) return [];
    
    // Handle special filter types
    if (selectedSpecies === SPECIES_CODES.ALL) {
      return allBirds;
    }
    
    if (selectedSpecies === SPECIES_CODES.RARE) {
      return allBirds.filter(bird => bird.isNotable);
    }
    
    // Filter by specific species
    return allBirds.filter(bird => bird.speciesCode === selectedSpecies);
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
  
  const handleMoveEnd = useCallback((center) => {
    debug.debug('Map move ended at:', { lat: center.lat, lng: center.lng, isAnimating: isMapAnimating });
    setMapCenter({ lat: center.lat, lng: center.lng });

    // Skip region check if the map is currently animating (during flyTo)
    if (isMapAnimating) {
      debug.debug('Skipping region check during map animation');
      return;
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
          
          // Force data refetch with new region
          setLastFetchParams(null);
        }
      } catch (error) {
        debug.error('Error updating region:', error);
      }
    };
    
    // Check for region changes - our new utility handles caching internally
    updateRegion();
  }, [currentCountry, updateRegionSpecies, isMapAnimating]);

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
   * Fetches bird sighting data for a specific viewport segment
   * @async
   * @param {Object} viewport - Viewport segment parameters
   * @returns {Promise<Array>} Bird data for the segment
   */
  const fetchViewportSegment = useCallback(async (viewport) => {
    // Create the viewport API URL
    const apiUrl = buildViewportApiUrl(viewport);
    
    debug.info('Fetching segment data:', {
      viewport
    });
    
    const response = await fetch(apiUrl);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    return await response.json();
  }, []);

  /**
   * Merges existing bird data with new data from viewport segments
   * Handles deduplication where needed
   * @param {Array} existingData - Existing bird data
   * @param {Array} newData - New bird data to merge
   * @returns {Array} Combined bird data without duplicates
   */
  const mergeBirdData = useCallback((existingData, newData) => {
    // If either array is empty, return the other
    if (!existingData || existingData.length === 0) return newData;
    if (!newData || newData.length === 0) return existingData;
    
    // Use a map for efficient deduplication
    const uniqueBirds = new Map();
    
    // Add existing birds to the map
    existingData.forEach(bird => {
      const key = `${bird.speciesCode}-${bird.lat}-${bird.lng}-${bird.obsDt}`;
      uniqueBirds.set(key, bird);
    });
    
    // Add new birds, overwriting existing if notable
    newData.forEach(bird => {
      const key = `${bird.speciesCode}-${bird.lat}-${bird.lng}-${bird.obsDt}`;
      
      if (!uniqueBirds.has(key) || (bird.isNotable && !uniqueBirds.get(key).isNotable)) {
        uniqueBirds.set(key, bird);
      }
    });
    
    // Convert map back to array
    return Array.from(uniqueBirds.values());
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
        const filteredData = filterBirdDataBySpecies(allBirdData);
        
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
    
    // Get segments to fetch (if partial fetch is possible)
    const segmentsToFetch = getViewportSegmentsToFetch(currentViewport, lastFetchViewport);
    
    startLoading();
    
    try {
      let data;
      
      // Check if we can do a partial fetch
      if (segmentsToFetch && allBirdData) {
        debug.info(`Performing partial fetch for ${segmentsToFetch.length} viewport segments`);
        
        // Fetch each segment in parallel
        const segmentDataPromises = segmentsToFetch.map(fetchViewportSegment);
        const segmentResults = await Promise.all(segmentDataPromises);
        
        // Merge all segment data
        let newSegmentData = [];
        segmentResults.forEach(segmentData => {
          newSegmentData = [...newSegmentData, ...segmentData];
        });
        
        // Calculate what % of the data we saved by doing a partial fetch
        const segmentCount = newSegmentData.length;
        const fullCount = allBirdData.length;
        const savingsPercent = Math.round((1 - (segmentCount / fullCount)) * 100);
        
        debug.info(`Partial fetch optimization: Received ${segmentCount} records vs. potential ${fullCount} (saved ~${savingsPercent}% of data transfer)`);
        
        // Merge with existing data
        data = mergeBirdData(allBirdData, newSegmentData);
        
        debug.info(`Merged data now contains ${data.length} unique bird records`);
      } else {
        // Full fetch required
        debug.info('Performing complete viewport fetch');
        
        // Create the viewport API URL
        const apiUrl = buildViewportApiUrl(currentViewport);
        
        debug.info('Fetching bird data:', {
          viewport: currentViewport
        });
        
        const response = await fetch(apiUrl);
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        // We get all bird data (both regular and notable) in one call
        data = await response.json();
      }
      
      // Store complete data set for client-side filtering
      setAllBirdData(data);
      setLastFetchViewport(currentViewport);
      
      // Filter the data by current species selection
      const filteredData = filterBirdDataBySpecies(data);
      
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
  }, [mapRef, back, selectedSpecies, lastFetchViewport, lastFetchParams, allBirdData, startLoading, endLoading, isViewportContained, filterBirdDataBySpecies, processAndDisplayFilteredData, currentCountry, getViewportSegmentsToFetch, fetchViewportSegment, mergeBirdData]);
  

  useEffect(() => {
    debug.debug('Fetch effect running with:', {
      loading,
      mapCenter,
      selectedSpecies,
      back,
      zoom,
      hasMapRef: !!mapRef
    });
    if (!loading && mapCenter && selectedSpecies && back && zoom && mapRef) {
      debug.debug('Triggering bird data fetch');
      fetchBirdData();
    }
  }, [back, selectedSpecies, mapCenter, zoom, mapRef, loading, fetchBirdData]);
  
  // Effect to handle species filtering when we have viewport data
  useEffect(() => {
    if (allBirdData && loadingStateRef.current === 0) {
      debug.info('🔄 Species changed, filtering existing data:', selectedSpecies);
      
      // Start a loading operation for the filtering process
      startLoading();
      
      // Need to use requestAnimationFrame to ensure the loading state renders
      // before we start potentially CPU-intensive filtering
      requestAnimationFrame(() => {
        try {
          // Filter existing data without fetching
          const filteredData = filterBirdDataBySpecies(allBirdData);
          
          // Process and display the filtered data
          startLoading(); // Add another loading operation for the processing stage
          processAndDisplayFilteredData(filteredData)
            .catch(error => {
              debug.error('Error during species filtering:', error);
            })
            .finally(() => {
              // End the loading operation for filtering
              endLoading();
            });
        } catch (error) {
          debug.error('Error filtering data:', error);
          endLoading();
        }
      });
    }
  }, [selectedSpecies, allBirdData, startLoading, endLoading]);

  // Load URL parameters on component mount
  useEffect(() => {
    const loadUrlParams = async () => {
      try {
        debug.debug('Loading URL parameters');
        const params = await getMapParamsFromUrl();
        setUrlParams(params);
        setMapCenter({ lat: params.lat, lng: params.lng });
        setSelectedSpecies(params.species);
        setBack(params.back);
        setZoom(params.zoom);

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
            onSpeciesSelect={handleSpeciesSelect}
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
            minZoom={MAP_ZOOM_CONSTRAINTS.MIN_ZOOM}
            maxZoom={MAP_ZOOM_CONSTRAINTS.MAX_ZOOM}
            style={LAYOUT_STYLES.map}
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
            <MapEvents onMoveEnd={handleMoveEnd} onViewportChange={handleViewportChange} />
            <PopupInteractionHandler />
            <ZoomControl position="topright" />
            <LocationControl 
              setIsMapAnimating={setIsMapAnimating} 
              onAnimationComplete={handleMoveEnd} 
            />
            {birdSightings.map((location, index) => (
              <BirdMarker
                key={`${location.lat}-${location.lng}-${index}`}
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
                onSpeciesSelect={handleSpeciesSelect}
                mapRef={mapRef}
              />
            ))}
            {loading && <LoadingOverlay />}
          </MapContainer>
        )}
      </div>
    </div>
  );
};

export default BirdMap;