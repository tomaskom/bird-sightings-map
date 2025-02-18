import { COLORS } from './colors';

export const LAYOUT_STYLES = {
    container: {
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        width: '100%',
        backgroundColor: COLORS.background
    },
    controlsWrapper: {
        padding: '0.5rem',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'flex-start',
        gap: '1rem'
    },
    controlGroup: {
        display: 'flex',
        gap: '0.5rem',
        alignItems: 'center',
        flexWrap: 'wrap',
        minWidth: '280px'
    },
    pullDown: {
        display: 'flex',
        alignItems: 'center',
        gap: '0.25rem',
        whiteSpace: 'nowrap'
    },
    searchForm: {
        display: 'flex',
        gap: '0.25rem',
        flex: 1,
        minWidth: '280px'
    },
    mapContainer: {
        flex: 1,
        minHeight: 0,
        position: 'relative'
    },
    map: {
        height: '100%',
        width: '100%',
        borderRadius: '0.375rem',
        position: 'relative'
    },
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
export const POPUP_LAYOUT_STYLES = {
    contentContainer: {
      maxHeight: '225px',
      overflowY: 'auto',
      transform: 'translateZ(0)'
    },
    photoModal: {
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: COLORS.modal.overlay,
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 2000,
      cursor: 'pointer'
    },
    modalImage: {
      maxWidth: '90%',
      maxHeight: '90%',
      objectFit: 'contain'
    },
    birdEntry: {
      padding: 0,
      paddingTop: '0.25rem',
      paddingBottom: '0.25rem'
    },
    thumbnail: {
      width: '100px',
      height: '75px',
      objectFit: 'cover',
      cursor: 'pointer',
      marginBottom: '0.25rem',
      borderRadius: '4px'
    }
  };
  export const NOTIFICATION_LAYOUT_STYLES = {
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
    spinnerIcon: {
      animation: 'spin 1s linear infinite',
      color: COLORS.text.light
    }
  };
  
  // src/styles/animations.js
  export const ANIMATIONS = {
    fadeInOut: `
      @keyframes fadeInOut {
        0% { opacity: 0; }
        10% { opacity: 1; }
        80% { opacity: 1; }
        100% { opacity: 0; }
      }
    `,
    spin: `
      @keyframes spin {
        to { transform: rotate(360deg); }
      }
    `
  };