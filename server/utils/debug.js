const DEBUG_LEVEL = parseInt(process.env.SERVER_DEBUG_LEVEL || '0');

const debug = {
  error: (...args) => DEBUG_LEVEL >= 1 && console.error(new Date(), '[ERROR]', ...args),
  warn: (...args) => DEBUG_LEVEL >= 2 && console.warn(new Date(), '[WARN]', ...args),
  info: (...args) => DEBUG_LEVEL >= 3 && console.info(new Date(), '[INFO]', ...args),
  debug: (...args) => DEBUG_LEVEL >= 4 && console.log(new Date(), '[DEBUG]', ...args)
};

module.exports = { debug };