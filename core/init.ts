import { loadOzonePrerequisites } from "./loadPrereq.ts";
import { loadOzoneConfiguration } from './loadConfiguration.ts';
import { loadServicesFromFile } from './loadServices.ts';

import { initializeCoreQueue } from './queue.ts';

// Load in core essentials (like logger configuration)
const [logger] = await loadOzonePrerequisites();

const [serviceDefinitionMap, ozoneConfig] = await Promise.all([
    // scan the provided compose file and extract hostnames
    loadServicesFromFile(),
    // also load configuration from the environment (secret, hostname)
    loadOzoneConfiguration(),
]);

logger.info('Ozone configuration is ready. Proceeding to establish arterial connections');

// create stateful memory store, set keys to match names of services

// create core event queue, configure for expected services
// Each container client is a WebSocket server, and we try to connect to it when we send it
const coreQueue = initializeCoreQueue({
    // services to reach and connect to.
    serviceDefinitionMap,
    // the Ozone configuration
    ozoneConfig,
}, async function outgoingEventHandler(allEventsToSend, arteryAccessor) {
    // This function gets called whenever an event is intended to be sent to a single service
    // If it fails to send to a specific service, the queue will automatically schedule it to be sent again
    const eventIsHeartbeat = allEventsToSend[0].intent === 'HEARTBEAT';

    // the artery is the channel which we receive and send events
    const artery = eventIsHeartbeat ?
        // If we are sending out a heartbeat, attempt to establish a connection (which gets saved by the queue)
        (await arteryAccessor.getOrActivate()) :
        // Get the existing artery (if active, otherwise null)
        (await arteryAccessor.getOnlyIfActive());

    if (!artery) {
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
        const moreThanOneEventToSend = allEventsToSend.length > 1;
        await artery[moreThanOneEventToSend ? 'sendBatch' : 'send'](allEventsToSend);
    } catch (websocketError) {
        // We NEED to be really careful here. Ozone will ONLY backlog events if the connection is faulty, not if the service
        // is badly handling receipts. It's not the core's job to compensate if a service it's publishing can receive connections,
        // but can't be coded to process them.

        let failureIsConnectionRelated = false;

        if (!eventIsHeartbeat && failureIsConnectionRelated) {
            // schedule any already unscheduled events to try again based on the timestamp provided
            // avoid doing this for heartbeats
            return false;
        }

        // otherwise discard events, but show scary warning as this means the service is live but busted
        console.error('Ozone has detected a potential failure in the processing loop of a given service');
    }

    return true;
});


// subscribe to heartbeat response (__OZONE_CORE__HEARTBEAT__), detect (overwriteState: true in response - but only for this request)

// subscribe to __OZONE_CORE__GET_STATE

// init the event queue, start sending out heartbeats to each service (with requestingState: true)
coreQueue.createHeartbeat();



// coreQueue.broadcast('*', 'HEARTBEAT')