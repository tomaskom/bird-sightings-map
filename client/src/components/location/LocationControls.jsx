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
 * Description: UI notification components for map interactions
 * 
 * Dependencies: same as BirdMap.jsx
 */
import React, { useState, useCallback, useEffect } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { debug } from '../../utils/debug';

export const LocationControl = () => {
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
    const customControl = createCustomControl(handleLocate, isLocating);
    debug.debug('Adding location control to map');
    
    const locateControl = new customControl();
    map.addControl(locateControl);
    
    setupLocationHandlers(map, setIsLocating);
    
    return () => {
      debug.debug('Cleaning up location control');
      map.removeControl(locateControl);
    };
  }, [map, handleLocate, isLocating]);
  
  return null;
};

const createCustomControl = (handleLocate, isLocating) => {
  return L.Control.extend({
    options: {
      position: 'topright'
    },
    
    onAdd: function() {
      const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
      const button = createControlButton(container, handleLocate, isLocating);
      return container;
    }
  });
};

const createControlButton = (container, handleLocate, isLocating) => {
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
  
  return button;
};

const setupLocationHandlers = (map, setIsLocating) => {
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
    map.off('locationfound', onLocationFound);
    map.off('locationerror', onLocationError);
  };
};