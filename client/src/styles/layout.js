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
 * Description: Defines layout styles for the bird sightings map application.
 * Includes styles for the main container, controls, map display, popups,
 * notifications, and animations.
 * 
 * Dependencies: colors.js
 */

import { COLORS } from './colors';

/**
 * Main layout styles for the application
 * @constant
 */
export const LAYOUT_STYLES = {
    // Primary container with column layout
    container: {
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        width: '100%',
        backgroundColor: COLORS.background
    },
    // Wrapper for control elements with flexible layout
    controlsWrapper: {
        padding: '0.5rem',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'flex-start',
        gap: '1rem'
    },
    // Groups related controls with minimum width
    controlGroup: {
        display: 'flex',
        gap: '0.5rem',
        alignItems: 'center',
        flexWrap: 'wrap',
        minWidth: '280px'
    },
    // Dropdown menu container
    pullDown: {
        display: 'flex',
        alignItems: 'center',
        gap: '0.25rem',
        whiteSpace: 'nowrap'
    },
    // Search form with flexible width
    searchForm: {
        display: 'flex',
        gap: '0.25rem',
        flex: 1,
        minWidth: '280px'
    },
    // Map wrapper with relative positioning
    mapContainer: {
        flex: 1,
        minHeight: 0,
        position: 'relative'
    },
    // Map element styles
    map: {
        height: '100%',
        width: '100%',
        borderRadius: '0.375rem',
        position: 'relative'
    },
    // Loading state container
    loadingContainer: {
        height: '100%',
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: COLORS.background,
        borderRadius: '0.375rem'
    }
};

/**
 * Popup and modal specific styles
 * @constant
 */
export const POPUP_LAYOUT_STYLES = {
    // Scrollable content container
    contentContainer: {
        maxHeight: '225px',
        overflowY: 'auto',
        transform: 'translateZ(0)'
    },
    // Full-screen photo modal
    photoModal: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: COLORS.modal.background,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 2000,
        cursor: 'pointer'
    },
    // Modal image constraints
    modalImage: {
        maxWidth: '90%',
        maxHeight: '90%',
        objectFit: 'contain'
    },
    // Bird entry layout
    birdEntry: {
        padding: 0,
        paddingTop: '0.25rem',
        paddingBottom: '0.25rem'
    },
    // Thumbnail image styles
    thumbnail: {
        width: '100px',
        height: '75px',
        objectFit: 'cover',
        cursor: 'pointer',
        marginBottom: '0.25rem',
        borderRadius: '4px'
    }
};

/**
 * Notification and loading overlay styles
 * @constant
 */
export const NOTIFICATION_LAYOUT_STYLES = {
    // Temporary notification popup
    fadeNotification: {
        position: 'absolute',
        bottom: '20px',
        left: '50%',
        transform: 'translateX(-50%)',
        backgroundColor: COLORS.overlay.background,
        color: COLORS.text.light,
        padding: '12px 20px',
        borderRadius: '8px',
        zIndex: 1000,
        maxWidth: '80%',
        textAlign: 'center',
        animation: 'fadeInOut 8s ease-in-out forwards'
    },
    // Full-screen loading overlay
    loadingOverlay: {
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
    },
    // Loading spinner container
    loadingSpinner: {
        width: '40px',
        height: '40px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: COLORS.overlay.spinner,
        borderRadius: '50%',
        boxShadow: COLORS.shadow.dark
    },
    // Spinning animation for loader
    spinnerIcon: {
        animation: 'spin 1s linear infinite',
        color: COLORS.text.light
    }
};

/**
 * CSS keyframe animations
 * @constant
 */
export const ANIMATIONS = {
    // Fade in/out animation for notifications
    fadeInOut: `
        @keyframes fadeInOut {
            0% { opacity: 0; }
            10% { opacity: 1; }
            80% { opacity: 1; }
            100% { opacity: 0; }
        }
    `,
    // Spinning animation for loading indicators
    spin: `
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
    `
};