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
 * Description: Custom location control component for Leaflet maps that adds a location
 * tracking button with accessibility support. Handles user location detection,
 * map centering, and error handling with visual feedback.
 * 
 * Dependencies: same as BirdMap.jsx
 */
import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { CONTROL_BUTTON_STYLES } from '../../styles/controls';
import { debug } from '../../utils/debug';

export const LocationControl = () => {
  const map = useMap();
  const [isLocating, setIsLocating] = useState(false);

  // Memoize the locate handler to prevent recreating the function on rerenders
  const handleLocate = useMemo(() => {
    return () => {
      debug.debug('Location button clicked');
      setIsLocating(true);

      // Request user location with high accuracy and short-term caching
      map.locate({
        setView: false,
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000 // Cache location for 1 minute
      });
    };
  }, [map]);

  // Group location event handlers together and memoize to prevent unnecessary recreations
  const locationHandlers = useMemo(() => ({
    onLocationFound: (e) => {
      debug.info('User location found:', {
        lat: e.latlng.lat,
        lng: e.latlng.lng,
        accuracy: e.accuracy
      });

      // Smoothly animate map to user's location
      map.flyTo(e.latlng, 12, {
        duration: 1.5,
        easeLinearity: 0.25
      });

      setIsLocating(false);
    },

    onLocationError: (e) => {
      debug.error('Location error:', e.message);
      const errorMsg = e.code === 1
        ? 'Location access denied. Please enable Location Services in your settings.'
        : 'Unable to get your location. Please try again.';

      alert(errorMsg);
      setIsLocating(false);
    }
  }), [map]);

  // Set up and clean up location control and event listeners
  useEffect(() => {
    const customControl = createCustomControl(handleLocate, isLocating);
    debug.debug('Adding location control to map');

    const locateControl = new customControl();
    map.addControl(locateControl);

    // Event listeners
    map.on('locationfound', locationHandlers.onLocationFound);
    map.on('locationerror', locationHandlers.onLocationError);

    return () => {
      debug.debug('Cleaning up location control');
      map.removeControl(locateControl);
      map.off('locationfound', locationHandlers.onLocationFound);
      map.off('locationerror', locationHandlers.onLocationError);
    };
  }, [map, handleLocate, isLocating, locationHandlers]);

  // Component doesn't render anything directly - it only adds the control to the map
  return null;
};

// Factory function to create a custom Leaflet control
const createCustomControl = (handleLocate, isLocating) => {
  return L.Control.extend({
    options: {
      position: 'topright'
    },

    onAdd: function () {
      const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
      const button = createControlButton(container, handleLocate, isLocating);
      return container;
    }
  });
};


// Creates an accessible button with location icon and keyboard support
const createControlButton = (container, handleLocate, isLocating) => {
  const button = L.DomUtil.create('a', 'leaflet-control-locate', container);

  // Apply styles from constant
  Object.assign(
    button.style,
    CONTROL_BUTTON_STYLES.base,
    isLocating ? CONTROL_BUTTON_STYLES.active : CONTROL_BUTTON_STYLES.inactive
  );

  button.title = 'Show current location';
  button.setAttribute('role', 'button'); // Add ARIA role
  button.setAttribute('aria-label', 'Show current location'); // Add ARIA label

  // Location icon
  button.innerHTML = `
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      height="20" 
      width="20" 
      viewBox="0 -960 960 960" 
      fill="white"
      aria-hidden="true"
    >
      <path d="M516-120 402-402 120-516v-56l720-268-268 720h-56Zm26-148 162-436-436 162 196 78 78 196Zm-78-196Z"/>
    </svg>
  `;

  // Keyboard support
  button.setAttribute('tabindex', '0');
  L.DomEvent
    .on(button, 'click keydown', function (e) {
      if (e.type === 'click' || e.key === 'Enter' || e.key === ' ') {
        L.DomEvent.stopPropagation(e);
        L.DomEvent.preventDefault(e);
        handleLocate();
      }
    });

  return button;
};