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
* Description: Implements a custom button control that tracks the user's
* location. Includes accessible keyboard controls and loading states, with
* animated map centering on location updates.
* 
* Dependencies: react, react-leaflet, leaflet, styles/controls, utils/debug
*/

import { useState, useEffect, useMemo } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { CONTROL_BUTTON_STYLES } from '../../styles/controls';
import { debug } from '../../utils/debug';
import { animateMapToLocation } from '../../utils/mapUtils';

/**
* Custom Leaflet control component for location tracking
* @component
* @param {Object} props - Component props
* @param {Function} props.setIsMapAnimating - Function to set map animation state
* @param {Function} props.onAnimationComplete - Callback when animation completes
* @returns {null} - Renders no DOM elements directly
*/
export const LocationControl = ({ setIsMapAnimating, onAnimationComplete }) => {
 const map = useMap();
 const [isLocating, setIsLocating] = useState(false);

 // Memoize the locate handler to prevent recreating the function on rerenders
 const handleLocate = useMemo(() => {
   return () => {
     debug.debug('Location button clicked');
     setIsLocating(true);

     map.locate({
       setView: false,
       enableHighAccuracy: true,
       timeout: 10000,
       maximumAge: 60000
     });
   };
 }, [map]);

 // Group location event handlers together and memoize
 const locationHandlers = useMemo(() => ({
   onLocationFound: (e) => {
     debug.info('User location found:', {
       lat: e.latlng.lat,
       lng: e.latlng.lng,
       accuracy: e.accuracy
     });

     // Use the centralized animation utility
     animateMapToLocation(
       map,
       e.latlng,
       12,
       setIsMapAnimating,
       onAnimationComplete
     );

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
 }), [map, setIsMapAnimating, onAnimationComplete]);

 useEffect(() => {
   const customControl = createCustomControl(handleLocate, isLocating);
   debug.debug('Adding location control to map');

   const locateControl = new customControl();
   map.addControl(locateControl);

   map.on('locationfound', locationHandlers.onLocationFound);
   map.on('locationerror', locationHandlers.onLocationError);

   return () => {
     debug.debug('Cleaning up location control');
     map.removeControl(locateControl);
     map.off('locationfound', locationHandlers.onLocationFound);
     map.off('locationerror', locationHandlers.onLocationError);
   };
 }, [map, handleLocate, isLocating, locationHandlers]);

 return null;
};

/**
* Creates a custom Leaflet control class
* @param {Function} handleLocate - Click handler for the location button
* @param {boolean} isLocating - Current locating state
* @returns {L.Control} Extended Leaflet control
*/
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

/**
* Creates an accessible button element with location icon
* @param {HTMLElement} container - Parent container element
* @param {Function} handleLocate - Click handler for the button
* @param {boolean} isLocating - Current locating state
* @returns {HTMLElement} The created button element
*/
const createControlButton = (container, handleLocate, isLocating) => {
 const button = L.DomUtil.create('a', 'leaflet-control-locate', container);

 Object.assign(
   button.style,
   CONTROL_BUTTON_STYLES.base,
   isLocating ? CONTROL_BUTTON_STYLES.active : CONTROL_BUTTON_STYLES.inactive
 );

 button.title = 'Show current location';
 button.setAttribute('role', 'button');
 button.setAttribute('aria-label', 'Show current location');

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