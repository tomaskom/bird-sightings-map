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