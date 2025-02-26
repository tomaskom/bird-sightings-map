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
  calculateViewportRadius,
  shouldFetchNewData,
  formatCoordinates,
  animateMapToLocation
} from '../utils/mapUtils';
import {
  getRegionForCoordinates
} from '../utils/regionUtils';
import { getMapParamsFromUrl, updateUrlParams } from '../utils/urlUtils';
import { fetchBirdPhotos, processBirdSightings, buildApiUrl, buildViewportApiUrl, fetchLocationDetails, searchLocation, fetchNotableBirds } from '../utils/dataUtils';
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
import { FadeNotification, LoadingOverlay } from '../components/ui/Notifications';
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
  const markerRef = useRef();

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
            birds={location.birds} 
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
  const [showNotification, setShowNotification] = useState(true);
  const [isMapAnimating, setIsMapAnimating] = useState(false);
  const [visibleSpeciesCodes, setVisibleSpeciesCodes] = useState(new Set());
  const [notableSpeciesCodes, setNotableSpeciesCodes] = useState(new Set());
  const [useViewportApi, setUseViewportApi] = useState(true); // Toggle for using new API
  const inputRef = useRef(null);

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

    setSelectedSpecies(speciesCode);
    
    if (mapRef) {
      updateUrlParams({
        species: speciesCode
      });
      
      // With viewport API, we can filter data locally without refetching
      if (useViewportApi && allBirdData) {
        // Update last fetch params, but don't clear the viewport data
        setLastFetchParams({
          ...lastFetchParams,
          species: speciesCode
        });
        
        debug.info('🔄 Filtering existing viewport data for new species:', speciesCode);
        
        // We'll handle the filtering in the useEffect
      } else {
        // Using legacy API - need to refetch
        setLastFetchParams(null); // Force refetch with new species
      }
    }
  }, [mapRef, useViewportApi, allBirdData, selectedSpecies, lastFetchParams]);

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
   * Fetches bird sighting data based on current map viewport
   * @async
   */
  const fetchBirdData = async () => {
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
    if (useViewportApi && isViewportContained(lastFetchViewport, currentViewport) && allBirdData) {
      debug.debug('Viewport is contained within last fetch, reusing data');
      
      // Filter the existing data by species if needed
      if (selectedSpecies !== lastFetchParams?.species) {
        debug.debug('Filtering existing data for new species selection:', selectedSpecies);
        
        // Process filtered data
        processAndDisplayFilteredData(filterBirdDataBySpecies(allBirdData));
      }
      
      return;
    }
    
    // Legacy check for traditional center/radius approach (fallback)
    if (!useViewportApi) {
      const currentRadius = calculateViewportRadius(bounds);
      const currentParams = {
        back,
        species: selectedSpecies,
        radius: currentRadius,
        region: currentCountry
      };
      
      if (!shouldFetchNewData(lastFetchParams, currentParams, lastFetchLocation, mapCenter)) {
        debug.debug('Skipping fetch - within threshold (legacy method)');
        return;
      }
    }
    
    setLoading(true);
    
    try {
      let apiUrl, debugInfo;
      
      // Use viewport API if enabled, otherwise fall back to center/radius
      if (useViewportApi) {
        apiUrl = buildViewportApiUrl(currentViewport);
        debugInfo = { viewport: currentViewport };
      } else {
        const { lat, lng } = formatCoordinates(mapCenter.lat, mapCenter.lng);
        const currentRadius = calculateViewportRadius(bounds);
        
        apiUrl = buildApiUrl({
          lat,
          lng,
          radius: currentRadius,
          species: selectedSpecies,
          region: currentCountry,
          back
        });
        
        debugInfo = {
          lat, 
          lng, 
          radius: currentRadius,
          species: selectedSpecies,
          region: currentCountry,
          back
        };
      }
      
      debug.info('Fetching bird data:', {
        useViewportApi,
        ...debugInfo
      });
      
      const response = await fetch(apiUrl);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      // With the new API, we get both regular and notable birds in one call
      const data = await response.json();
      
      if (useViewportApi) {
        // Store complete data set for client-side filtering
        setAllBirdData(data);
        setLastFetchViewport(currentViewport);
        
        // Filter the data by current species selection
        const filteredData = filterBirdDataBySpecies(data);
        
        // Process and display the data
        processAndDisplayFilteredData(filteredData);
        
        // Update last fetch parameters for both approaches
        setLastFetchParams({ 
          back, 
          species: selectedSpecies,
          region: currentCountry 
        });
      } else {
        // Legacy approach - we need to fetch notable birds separately
        let notableBirdsPromise;
        if (selectedSpecies !== SPECIES_CODES.RARE) {
          const { lat, lng } = formatCoordinates(mapCenter.lat, mapCenter.lng);
          const currentRadius = calculateViewportRadius(bounds);
          notableBirdsPromise = fetchNotableBirds(lat, lng, currentRadius, back);
        }
        
        // Process legacy data
        const processedSightings = await processBirdSightings(data);
        
        // Get the current visible viewport bounds
        const bounds = mapRef.getBounds();
        const visibleBounds = {
          minLat: bounds.getSouth(),
          maxLat: bounds.getNorth(),
          minLng: bounds.getWest(),
          maxLng: bounds.getEast()
        };
        
        // Extract species codes but ONLY for birds actually within the visible viewport
        // This ensures "on map" actually means "visible on the map"
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
        
        debug.info('Species visible in viewport:', {
          count: currentVisibleSpecies.size,
          sample: Array.from(currentVisibleSpecies).slice(0, 3)
        });
        
        // Set visible species codes - this updates the "on map" section in the dropdown
        setVisibleSpeciesCodes(currentVisibleSpecies);
        
        // Get and set notable species
        let currentNotableSpecies;
        if (selectedSpecies === SPECIES_CODES.RARE) {
          currentNotableSpecies = new Set([...currentVisibleSpecies]);
        } else {
          currentNotableSpecies = await notableBirdsPromise;
        }
        
        setNotableSpeciesCodes(currentNotableSpecies);
        setBirdSightings(processedSightings);
        setLastFetchLocation({ lat: mapCenter.lat, lng: mapCenter.lng });
        setLastFetchParams({ 
          back, 
          species: selectedSpecies, 
          radius: calculateViewportRadius(bounds), 
          region: currentCountry 
        });
      }
    } catch (error) {
      debug.error('Error fetching bird data:', error);
      alert('Error fetching bird sightings');
    } finally {
      setLoading(false);
    }
  };
  
  /**
   * Process filtered data and update state with it
   * @param {Array} filteredData - Bird data filtered by species
   */
  const processAndDisplayFilteredData = async (filteredData) => {
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
      
      // Extract notable species codes
      const currentNotableSpecies = new Set();
      filteredData.forEach(bird => {
        if (bird.isNotable && bird.speciesCode) {
          currentNotableSpecies.add(bird.speciesCode);
        }
      });
      
      debug.info('Processed filtered data:', {
        sightingLocations: processedSightings.length,
        visibleSpecies: currentVisibleSpecies.size,
        visibleSpeciesSample: Array.from(currentVisibleSpecies).slice(0, 3),
        notableSpecies: currentNotableSpecies.size
      });
      
      // Update state - this ensures the species search dropdown shows exactly what's in the viewport
      setVisibleSpeciesCodes(currentVisibleSpecies);
      setNotableSpeciesCodes(currentNotableSpecies);
      setBirdSightings(processedSightings);
    } catch (error) {
      debug.error('Error processing filtered data:', error);
    }
  };

  useEffect(() => {
    debug.debug('Fetch effect running with:', {
      loading,
      mapCenter,
      selectedSpecies,
      back,
      zoom,
      hasMapRef: !!mapRef,
      useViewportApi
    });
    if (!loading && mapCenter && selectedSpecies && back && zoom && mapRef) {
      debug.debug('Triggering bird data fetch');
      fetchBirdData();
    }
  }, [back, selectedSpecies, mapCenter, zoom, mapRef]);
  
  // Effect to handle species filtering when we have viewport data
  useEffect(() => {
    if (useViewportApi && allBirdData && !loading) {
      debug.info('🔄 Species changed, filtering existing data:', selectedSpecies);
      
      // Filter existing data without fetching
      const filteredData = filterBirdDataBySpecies(allBirdData);
      
      // Process and display the filtered data
      processAndDisplayFilteredData(filteredData);
    }
  }, [selectedSpecies, useViewportApi, allBirdData, loading]);

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

  // Show notification only once on initial mount
  useEffect(() => {
    debug.debug('Initializing notification state');
    setShowNotification(true);
  }, []);

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
                      location.birds.some(bird => notableSpeciesCodes.has(bird.speciesCode))
                    ) 
                  : (location.birds.length === 1 && notableSpeciesCodes.has(location.birds[0].speciesCode))
                    ? createNotableBirdIcon()
                    : DefaultIcon}
                notableSpeciesCodes={notableSpeciesCodes}
                onSpeciesSelect={handleSpeciesSelect}
                mapRef={mapRef}
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