import { send, generateArterialMap, ArterialMap } from "@o3/artery/artery.ts";
import { createQueueFromArterialMap, QueueEvent } from "@o3/artery/queue.ts";
import { loadOzonePrerequisites, loadOzoneConfiguration } from "./loadPrereq.ts";
import { loadServicesFromFile } from './loadServices.ts';

import {
    OZONE_HEARTBEAT_INTERVAL_MS
} from './constants.ts';

// Load in core essentials (like logger configuration)W
const [logger] = await loadOzonePrerequisites();

const [serviceDefinitionMap, ozoneConfig] = await Promise.all([
    // scan the provided compose file and extract hostnames
    loadServicesFromFile(),
    // also load configuration from the environment (secret, hostname)
    loadOzoneConfiguration(),
]);

logger.info('Ozone configuration is ready. Proceeding to establish arterial connections');

// create stateful memory store, set keys to match names of services

// create mapping of arteries
const arteryMap = generateArterialMap(serviceDefinitionMap, ozoneConfig);
 
// create core event queue, configure for expected services
// Each container client is a WebSocket server, and we try to connect to it when we send it
async function outgoingEventHandler(allEventsToSend : QueueEvent[], arterialMap: ArterialMap) {
    // This function gets called whenever an event is intended to be sent to a single service
    // If it fails to send to a specific service, the queue will automatically schedule it to be sent again    
    const eventIsHeartbeat = allEventsToSend[0].intent === 'HEARTBEAT';

    const artery = arterialMap.get(allEventsToSend[0].arteryName)!;

    // the artery is the channel which we receive and send events
    const arterySocket = eventIsHeartbeat ?
        // If we are sending out a heartbeat, attempt to establish a connection (which gets saved by the queue)
        (await artery.getSocketOrActivate()) :
        // Get the existing artery (if active, otherwise null)
        (await artery.getSocketOnlyIfActive());


    if (!arterySocket) {
        // If we can't establish a heartbeat yet, wait for the next opportunity
        if (eventIsHeartbeat) {
            return true;
        }

        // If we can't establish an artery, mark the event in the backlog and add a ms
        console.log('backlog')
        return false;
    }

    try {
        // send event(s) in either single or batch mode
        await send(arterySocket, allEventsToSend, { waitForAck: eventIsHeartbeat })
    } catch (websocketError) {
        logger.error('Ozone has detected a potential failure in the processing loop of a given service', websocketError);

        // We NEED to be really careful here. Ozone will ONLY backlog events if the connection is faulty, not if the service
        // is badly handling receipts. It's not the core's job to compensate if a service it's publishing can receive connections,
        // but can't be coded to process them.

        // dispose the socket ref and recreate a new one
        artery.empty();

        let failureIsConnectionRelated = false;

        if (!eventIsHeartbeat && failureIsConnectionRelated) {
            // schedule any already unscheduled events to try again based on the timestamp provided
            // avoid doing this for heartbeats
            return false;
        }

        // otherwise discard events, but show scary warning as this means the service is live but busted
    }

    return true;
}

const heart = createQueueFromArterialMap({
    arteryMap,
    initialQueue: [],
    outgoingEventHandler,
});

// subscribe to heartbeat response (__OZONE_CORE__HEARTBEAT__), detect (overwriteState: true in response - but only for this request)

// subscribe to __OZONE_CORE__GET_STATE

// init the event queue, start sending out heartbeats to each service (with requestingState: true)
heart.addCoreReceivers();

logger.info(`Starting heartbeat [OZONE_HEARTBEAT_INTERVAL_MS=${OZONE_HEARTBEAT_INTERVAL_MS}]`)

// TODO: Failure state needs to be implemented here
heart.createHeartbeat(OZONE_HEARTBEAT_INTERVAL_MS);