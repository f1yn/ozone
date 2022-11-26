import { log } from './deps.ts';

import {
    OZONE_SECRET_NAME,
} from "./constants.ts";

interface OzoneCoreConfiguration {
    socketPort: number,
    secret: string,
}

/**
 * Load a container secret from disk
 * @param secretName
 */
const loadSecretFromFilesystem = secretName => Deno.readTextFile(`/run/secrets/${secretName}`);

export async function loadOzoneConfiguration() : Promise<OzoneCoreConfiguration>{
    const logger = log.getLogger('init');

    logger.debug('Attempting to load secret from filesystem');
    const secret = await loadSecretFromFilesystem(OZONE_SECRET_NAME);
    logger.debug('Secret was successfully loaded from filesystem');

    return {
        secret,
        socketPort: 1122,
    }
}