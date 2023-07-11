import { buildArteryInstance } from '@o3/artery/src/artery.ts';
import { createQueueFromArterialMap, QueueEvent, ArterialMap, QueueOutgoingEventHandler } from '@o3/artery/src/queue.ts';

import { log } from './deps.ts';
import { ServiceDefinitionMap } from './loadServices.ts';
import { OzoneCoreConfiguration } from './loadConfiguration.ts';

import {
    OZONE_HEARTBEAT_INTERVAL_MS
} from './constants.ts';

interface queueConfiguration {
    initialValue: QueueEvent[],
    serviceDefinitionMap: ServiceDefinitionMap,
    ozoneConfig: OzoneCoreConfiguration,
}

/**
 * Converts the services Map into a Map of service names to their artery
 * @param serviceMap
 */
function generateArterialMap(serviceMap: ServiceDefinitionMap, ozoneConfig: OzoneCoreConfiguration) {
    const arterialMap = new Map() as ArterialMap;

    for (const [serviceName, serviceDefinition] of serviceMap) {
        // create artery for this service, but don't do any async things yet (that's delegated to the core)
        arterialMap.set(serviceName, buildArteryInstance(serviceDefinition, ozoneConfig));
    }

    return arterialMap;
}


/**
 * Initializes the Ozone core queue. Also creates an arterial mapping for service communication
 * @param config 
 * @param outgoingEventHandle 
 * @returns 
 */
export function initializeCoreQueue(config : queueConfiguration, outgoingEventHandler : QueueOutgoingEventHandler) {
    const logger = log.getLogger('core');

    // create mapping of arteries
    const arteryMap = generateArterialMap(config.serviceDefinitionMap, config.ozoneConfig);

    /// create memory story of incoming/backlogged events
    const initialQueue : QueueEvent[] = config.initialValue ? Array.from(config.initialValue) : [];
    
    const {
        processQueue,
        incomingEventHandler
    } = createQueueFromArterialMap({
        arteryMap,
        initialQueue,
        outgoingEventHandler,
    });

    function createHeartbeat() {
        logger.info(`Starting heartbeat [OZONE_HEARTBEAT_INTERVAL_MS=${OZONE_HEARTBEAT_INTERVAL_MS}]`)
  
        // TODO: Failure state needs to be implemented here
  
        setInterval(() => {
            incomingEventHandler(null, { intent: 'HEARTBEAT', arteryName: '*', data: {} })
        }, OZONE_HEARTBEAT_INTERVAL_MS);
  
        incomingEventHandler(null, { intent: 'HEARTBEAT', arteryName: '*', data: {} });
    }

    return {
        processQueue,
        createHeartbeat
    }
}