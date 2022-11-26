import { buildArteryInstance } from '@o3/artery/src/artery.ts';

import { log } from './deps.ts';
import { ServiceDefinitionMap } from './loadServices.ts';
import { OzoneCoreConfiguration } from './loadConfiguration.ts';

import {
    OZONE_HEARTBEAT_INTERVAL_MS
} from './constants.ts';

interface queueConfiguration {
    initialValue: any[],
    serviceDefinitionMap: ServiceDefinitionMap,
    ozoneConfig: OzoneCoreConfiguration,
}

/**
 * Converts the services Map into a Map of service names to their artery
 * @param serviceMap
 */
function generateArterialMap(serviceMap: ServiceDefinitionMap, ozoneConfig: OzoneCoreConfiguration) {
    const arterialMap = new Map();

    for (const [serviceName, serviceDefinition] of serviceMap) {
        // create artery for this service, but don't do any async things yet (that's delegated to the core)
        arterialMap.set(serviceName, buildArteryInstance(serviceDefinition, ozoneConfig));
    }

    return arterialMap;
}

export function initializeCoreQueue(config : queueConfiguration, outgoingEventHandler) {
    const logger = log.getLogger('event');

    // create mapping of arteries
    const arteryMap = generateArterialMap(config.serviceDefinitionMap, config.ozoneConfig);

    /// create memory story of incoming/backlogged events
    let queueInOrder = config.initialValue ? Array.from(config.initialValue) : [];

    function processQueue() {
        logger.debug(`Started processing queue`);
        // WARNING: This is event-loop sensitive, make sure we remove in-process nodes from the event queue
        // while processing, but re-add them if the exact conditions warrant so (backlogging). Also avoid
        // async await here if we can
        let currentEvent = queueInOrder.pop();

        while (currentEvent) {
            // get the current exec time
            // const now = new Date();

            // check if this event is a heartbeat (we only send heartbeat as a standalone)
            const eventIsHeartbeat = currentEvent.intent === 'HEARTBEAT';

            // get the artery accessor matched for this event
            const arteryAccessor = arteryMap.get(currentEvent.arteryName);

            // get any other events for this specific destination artery (if not heartbeat)
            // TODO: Implement sendAfter check againt now value
            const existingBacklog = eventIsHeartbeat ? [] :
                queueInOrder.filter(eventStillInQueue => eventStillInQueue.arteryName === currentEvent.arteryName)

            if (existingBacklog.length) {
                // remove those elements from the queue while we process (same reason as initial warning)
                queueInOrder = queueInOrder
                    .filter(eventStillInQueue => eventStillInQueue.arteryName === currentEvent.arteryName);
            }

            const eventsToSend = [currentEvent, ...existingBacklog];

            // do this synchronously (if we can)
            outgoingEventHandler(eventsToSend, arteryAccessor)
                .then((didSend) => {
                    if (!didSend) {
                        // if we get here, it means we need to add the events back to the backlog
                        // TODO:  apply (sendAfter if not already on the model)
                        queueInOrder.unshift(...eventsToSend);
                    }
                })
                .catch((error) => {
                    // If we get here, something in Ozone is badly broken
                    console.error('FATAL event processing error', error)
                })

            // queue next iteration
            currentEvent = queueInOrder.pop();
        }
        logger.debug(`Finished processing queue`);
    }

    // This handles events originating from services
    async function incomingEventHandler(originalArteryRef, originalEventPayload) {
        logger.info(`Received incoming event INTENT="${originalEventPayload.intent
        }" from ARTERY=@${originalArteryRef?.serviceName || 'SELF'}`)

        // start iterating know arteries (by name and ref) and start scheduling events to be sent
        for (const [arteryName, arteryRef] of arteryMap) {
            if (originalArteryRef && arteryRef === originalArteryRef) {
                // don't send the same event back through the artery that delivered it
                continue;
            }

            // Add the event to the end of the queue
            queueInOrder.push({
                // add the artery by name
                arteryName,
                intent: originalEventPayload.intent,
                // attach the ref to the original payload data
                data: originalEventPayload.data,
                // TODO: preserve idempotency (from service) to prevent repeat sends
            });
        }

        // Start sending events
        if (queueInOrder.length) {
            processQueue();
        }
    }

    function createHeartbeat() {
        logger.info(`Starting heartbeat [OZONE_HEARTBEAT_INTERVAL_MS=${OZONE_HEARTBEAT_INTERVAL_MS}]`)

        setInterval(() => {
            incomingEventHandler(null, { intent: 'HEARTBEAT' })
        }, OZONE_HEARTBEAT_INTERVAL_MS);

        incomingEventHandler(null, { intent: 'HEARTBEAT' });
    }

    return {
        processQueue,
        createHeartbeat
    }
}