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
 * Description: React components for displaying loading states and user notifications.
 * Includes an auto-dismissing notification and an interactive loading overlay.
 * 
 * Dependencies: react, styles/layout, styles/animations, utils/debug
 */

import React, { useState, useEffect } from 'react';
import { NOTIFICATION_LAYOUT_STYLES } from '../../styles/layout';
import { ANIMATIONS } from '../../styles/animations';
import { debug } from '../../utils/debug';

/**
 * Displays a temporary notification about eBird API limitations
 * @component
 * @returns {React.ReactElement|null}
 */
export const FadeNotification = () => {
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
    <div style={NOTIFICATION_LAYOUT_STYLES.fadeNotification}>
      <style>
        {ANIMATIONS.fadeInOut}
      </style>
      eBird API limits the number records returned for bird sightings.
      You may see sightings change as you pan and the number increase as you zoom in.
    </div>
  );
};

/**
 * Displays a fullscreen loading overlay with spinner
 * Prevents interaction with underlying elements while loading
 * @component
 * @returns {React.ReactElement}
 */
export const LoadingOverlay = () => (
  <div
    style={NOTIFICATION_LAYOUT_STYLES.loadingOverlay}
    onTouchStart={(e) => e.preventDefault()}
    onTouchMove={(e) => e.preventDefault()}
    onTouchEnd={(e) => e.preventDefault()}
    onClick={(e) => e.preventDefault()}
  >
    <div style={NOTIFICATION_LAYOUT_STYLES.loadingSpinner}>
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        style={NOTIFICATION_LAYOUT_STYLES.spinnerIcon}>
        <style>
          {ANIMATIONS.spin}
        </style>
        <path
          fill="currentColor"
          d="M12,4a8,8,0,0,1,7.89,6.7A1.53,1.53,0,0,0,21.38,12h0a1.5,1.5,0,0,0,1.48-1.75,11,11,0,0,0-21.72,0A1.5,1.5,0,0,0,2.62,12h0a1.53,1.53,0,0,0,1.49-1.3A8,8,0,0,1,12,4Z"
        />
      </svg>
    </div>
  </div>
);

LoadingOverlay.displayName = 'LoadingOverlay';
FadeNotification.displayName = 'FadeNotification';