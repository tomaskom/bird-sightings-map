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

import React, { useState, useEffect } from 'react';
import { debug } from '../../utils/debug';

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
      eBird API limits the number records returned for bird sightings. 
      You may see sightings change as you pan and the number increase as you zoom in.
    </div>
  );
};

export const LoadingOverlay = () => (
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
);

LoadingOverlay.displayName = 'LoadingOverlay';
FadeNotification.displayName = 'FadeNotification';