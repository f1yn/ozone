import { log } from '@o3/deps.ts';
import { receiveIncomingAck } from '@o3/common/ack.ts';

import { Artery, ArterialMap } from './artery.ts';


/**
 * Shared queue implementation for arterials
 * 
 * The core uses a queue with a wide arterial map, (routes from any o3 service to any o3 service)
 * The service impl. uses a queue with a single arterial (routes from any o3 service to only the core)
 */

export interface QueueEvent {
    intent: string,
    arteryName: string,
    data: any,
}

export type QueueOutgoingEventHandler = (eventsToSend: QueueEvent[], arteryMap: ArterialMap) => Promise<boolean>;

export interface QueueConfiguration {
    arteryMap: ArterialMap,
    initialQueue?: QueueEvent[],
    outgoingEventHandler: QueueOutgoingEventHandler,
}

export function createQueueFromArterialMap({
    arteryMap,
    initialQueue,
    outgoingEventHandler
} : QueueConfiguration) {
    const logger = log.getLogger('intent');

    /// create memory story of incoming/backlogged events
    let queueInOrder = initialQueue || [];

    function processQueue() {
        logger.debug(`Started processing queue`);
        // WARNING: This is event-loop sensitive, make sure we remove in-process nodes from the event queue
        // while processing, but re-add them if the exact conditions warrant so (backlogging). Also avoid
        // async await here if we can
        let currentEvent = queueInOrder.pop()!;

        while (currentEvent) {
            // get the current exec time
            // const now = new Date();
            logger.info(`Processing intent ${currentEvent.intent} for artery ${currentEvent.arteryName}`);

            // check if this event is a heartbeat (we only send heartbeat as a standalone)
            const eventIsHeartbeat = currentEvent.intent === 'HEARTBEAT';

            // get any other events for this specific destination artery (if not heartbeat)
            // TODO: Implement sendAfter check against now value
            const existingBacklog = eventIsHeartbeat ? [] :
                queueInOrder.filter(eventStillInQueue => eventStillInQueue.arteryName === currentEvent.arteryName)

            if (existingBacklog.length) {
                logger.info(`A backlog was detected for artery ${currentEvent.arteryName}, also enqueuing`);

                // remove those elements from the queue while we process (same reason as initial warning)
                queueInOrder = queueInOrder
                    .filter(eventStillInQueue => eventStillInQueue.arteryName === currentEvent.arteryName);
            }

            const eventsToSend = [currentEvent, ...existingBacklog];

            // do this synchronously (if we can)
            outgoingEventHandler(eventsToSend, arteryMap)
                .then((didSend) => {
                    if (!didSend) {
                        // if we get here, it means we need to add the events back to the backlog
                        // TODO:  apply (sendAfter if not already on the model)
                        queueInOrder.unshift(...eventsToSend);
                    }
                })
                .catch((error: Error) => {
                    // If we get here, something in Ozone is badly broken
                    console.error('FATAL event processing error', error)
                })

            // queue next iteration (loop will bail is currentEventIsNull)
            currentEvent = queueInOrder.pop()!;
        }
        logger.info(`Finished processing queue`);
    }

    // This handles events originating from services
    function incomingEventHandler(originalArteryRef: Artery | null, originalEventPayload: QueueEvent) {
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

    // Services also use similar code, can (should) we consolidate?
    function addCoreReceivers() {
        for (const [arteryName, arteryRef] of arteryMap) {
            logger.info(`Configuring up artery incoming event handler ARTERY=@${arteryName}`)
            
            // Skip processing if we get an ACK (that's handled on it's own)
            arteryRef?.handler.addReceiver(receiveIncomingAck)

            // Add intent processor
            arteryRef?.handler.addReceiver(async function processIncomingIntent(_socket : WebSocket, { payload } : { payload: QueueEvent[] }) {
                payload.forEach(intent => incomingEventHandler(arteryRef, intent));
            });
        }
    }

    function createHeartbeat(startInterval: number) {
        incomingEventHandler(null, { intent: 'HEARTBEAT', arteryName: '*', data: { requestingState: true } });

        setInterval(() => {
            incomingEventHandler(null, { intent: 'HEARTBEAT', arteryName: '*', data: {} })
        }, startInterval);   
    }

    return {
        processQueue,
        addCoreReceivers,
        incomingEventHandler,
        createHeartbeat,
    }
}