import { yaml, log } from './deps.ts';

import {
    OZONE_SECRET_NAME,
    OZONE_SERVICE_ENGINE,
} from "./constants.ts";

interface ServiceDefinition {
    name: string,
    hostname: string,
}

export type ServiceDefinitionMap = Map<key, ServiceDefinition>;

/**
 * Checks a parser secrets key from a service compose file and verifies it contains at least one valid
 * reference to the shared Ozone secret key
 * @param composeSecret
 */
const ozoneSecretCorrectlyConfiguredCompose = (composeSecret) =>
    composeSecret && (composeSecret.source === OZONE_SECRET_NAME ||
        composeSecret.target === OZONE_SECRET_NAME);

/**
 * Loads service definitions from the /services.yml file, in the (docker|podman)-compose format
 */
async function parseComposeDefinitionsFromFilesystem() : Promise<ServiceDefinitionMap> {
    const logger = log.getLogger('init');

    logger.debug(`Detecting service definitions from filesystem (using OZONE_SERVICE_ENGINE=${OZONE_SERVICE_ENGINE})`)

    const parsedManifest = yaml.parse(await Deno.readTextFile('/services.yml'));

    const servicesMap = new Map() as ServiceDefinitionMap;

    const originalServiceDefinitions = Object.entries(parsedManifest.services)

    for (const [name, rawDefinition] of originalServiceDefinitions) {
        // detect that the correct secret was found
        const hasMatchingSecret = (rawDefinition.secrets || []).some(ozoneSecretCorrectlyConfiguredCompose);

        if (!hasMatchingSecret) {
            logger.info(`Service "${name}" did not have the correct secret definitions and was ignored`);
            // skip services that aren't correctly configured
            continue;
        }
        // Determine if we should skip setting up this service based on any labels it might have
        const shouldSkipService = rawDefinition.labels?.find((label) => ['o3.core'].includes(label));

        if (shouldSkipService) {
            logger.info(`Service "${name}" presented the flag ${shouldSkipService} and was therefore skipped`);
            continue
        }

        // TODO: add ability to limit subscriptions using container labels

        servicesMap.set(name, {
            name,
            hostname: rawDefinition.hostname || rawDefinition.container_name || name
        });

        logger.debug(`Service "${name}" successfully registered`);
    }

    logger.debug(`Registered ${servicesMap.size} of ${originalServiceDefinitions.length} service${originalServiceDefinitions.length > 1 ? 's' : ''}`);

    return servicesMap;
}

/**
 * Loads service definitions for consumption by Ozone for its event/arterial system
 */
export async function loadServicesFromFile() : Promise<ServiceDefinitionMap> {
    if (OZONE_SERVICE_ENGINE !== 'compose') {
        throw new Error(`Currently, Ozone can only parse compose service definitions - but "${OZONE_SERVICE_ENGINE}" was requested`);
    }

    return parseComposeDefinitionsFromFilesystem();
}