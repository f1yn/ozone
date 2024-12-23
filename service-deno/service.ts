import { createQueueFromArterialMap, QueueEvent } from '@o3/artery/queue.ts';
import { setupOzoneLogging } from '@o3/core/loadPrereq.ts';
import { send as arterialSend, ArterialMap } from '@o3/artery/artery.ts';
import { getCurrentSocket, initServerServiceLoop, intentEmitter } from './server.ts';

await setupOzoneLogging();

/**
 * Ozone service implementation (deno)
 * 
 * Outgoing events need to be queued, but incoming events use a basic pubsub format.
 */

// We use a fake Arterial map when subscribed as a service. If we really wanted, it could be possible to double this up in the future.
const arteryMap = new Map([
    ['core', null]
]) as ArterialMap;

// Create queue for events to send back to the core
const o3Queue = createQueueFromArterialMap({
    arteryMap,
    // Responsible for dispatching queued events to the core
    async outgoingEventHandler(eventsToSend) {
        // Only returns a truthy value when a socket is available
        const arterySocket = getCurrentSocket();

        if (!arterySocket) {
            // Skip processing if the artery isn't active. Will propagate on next event send
            return false;
        }

        await arterialSend(arterySocket, eventsToSend, {});    
        return true;
    }
});

/**
 * Sends an intent with data to the core by adding it to the queue. Applied without a promise chain
 * @param intentName 
 * @param data 
 * @param data 
 */
function send(intentName: string, data: any) {
    // Adds an event to the queue (does not yet await - need to implement callback queue impl)
    o3Queue.incomingEventHandler(null, { arteryName: 'core', intent: intentName, data });
}

// stub
// function sendAndAwait() {}

/**
 * 
 */
async function createService(initialState: any) {
    // Implement timeout here
    await initServerServiceLoop(initialState);
    console.log('I am connected with the core!');
}

/**
 * Adds an intent listener
 * @param intentName 
 * @param callback 
 * @returns 
 */
function addListener(intentName : string, callback: (payload: QueueEvent) => void) {
    return intentEmitter.addListener(intentName, callback);
}

/**
 * Removes an intent listener
 * @param intentName 
 * @param callbackRef 
 * @returns 
 */
function removeListener(intentName : string, callbackRef: (payload: QueueEvent) => void) {
    return intentEmitter.removeListener(intentName, callbackRef);
}

// return interface for subscribing to intents, but also sending them
export {
    createService,
    send,
    addListener,
    removeListener
}