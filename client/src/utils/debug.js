const DEBUG_LEVEL = parseInt(import.meta.env.VITE_DEBUG_LEVEL || '0');

export const debug = {
  error: (...args) => DEBUG_LEVEL >= 1 && console.error(...args),
  warn: (...args) => DEBUG_LEVEL >= 2 && console.warn(...args),
  info: (...args) => DEBUG_LEVEL >= 3 && console.info(...args),
  debug: (...args) => DEBUG_LEVEL >= 4 && console.log(...args)
};

// Optional: Add debug level constants if you want to reference them elsewhere
export const DEBUG_LEVELS = {
  NONE: 0,
  ERROR: 1,
  WARN: 2,
  INFO: 3,
  DEBUG: 4
};