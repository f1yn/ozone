/**
 * These are configuration keys that are statically determined when this module is loaded,
 * which means some of these keys will be set using ENV when they are progressively added.
 */

/**
 * The secretId to load depending on the service engine1
 */
export const OZONE_SECRET_NAME = 'o3_key';

/**
 * The service engine used when bootstrapping this core instance of Ozone
 */
export const OZONE_SERVICE_ENGINE = 'compose';

/**
 * The minimum interval to create a heartbeat
 */
export const OZONE_HEARTBEAT_INTERVAL_MS = 3000;

/**
 * The ozone service port
 */
export const OZONE_SOCKET_PORT = 1122;