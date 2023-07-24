import { log } from '@o3/deps.ts';

import { ServiceDefinition, ServiceDefinitionMap } from '@o3/core/loadServices.ts';
import { OzoneCoreConfiguration } from '@o3/core/loadPrereq.ts';

import { createFlatPromise, promiseResolver } from '@o3/common/promise.ts';
import { createMessageReceiver } from '@o3/common/reciever.ts';
import { createAckPromise } from '@o3/common/ack.ts';

export type Artery = ReturnType<typeof buildArteryInstance>;
export type ArterialMap = Map<string, Artery | null>

const SOCKET_OPEN = 1;

/**
 * Creates an artery from the core to a specific Ozone service. Returns getter functions that will return the socket if it exists
 * @param service 
 * @param ozoneConfig 
 * @returns 
 */
export function buildArteryInstance(service: ServiceDefinition, ozoneConfig: OzoneCoreConfiguration) {
    const logger = log.getLogger('arterial');
    const handler = createMessageReceiver();

    const serviceName = service.name;
    const serviceTargetHostname = service.hostname;

    // TODO: TLS
    const websocketUri = `ws://${serviceTargetHostname}:${ozoneConfig.socketPort}`;

    // Use a promise-ref to allow promise-splitting (multiple calls will resolve the same promise)
    let socketPromiseRef : Promise<WebSocket | null> | null = null;
    let socketPromiseHasResolved : boolean;
    
    async function getSocketOnlyIfActive() {
        logger.debug(`getSocketOnlyIfActive() was called for ARTERY=@${serviceName}`);
        const activeSocket = socketPromiseRef && (await socketPromiseRef);

        if (activeSocket && activeSocket.readyState === SOCKET_OPEN) {
            logger.debug(`Live artery available, returning result ARTERY=@${serviceName}`);
            return activeSocket;
        }

        logger.info(`An existing artery was not ready for ARTERY=@${serviceName}, attempting new connection`);

        return null;
    }

    async function getSocketOrActivate() {
        logger.debug(`getSocketOrActivate() was called for ARTERY=@${serviceName}`);

        if (socketPromiseRef && !socketPromiseHasResolved) {
            // Delegate handling to handler callback (avoids redundant processing of the same
            // getOrActive call if multiple calls overlap - i.e the socket connection takes longer than the next heartbeat
            return socketPromiseRef;
        }

        // If the socketPromiseRef is set, has been flagged as resolved - get that value
        // If we have the socket, return it
        const existingSocket = socketPromiseRef && socketPromiseHasResolved && (await socketPromiseRef)
        if (existingSocket) return existingSocket;

        logger.debug(`Attempting to connect artery ARTERY=@${serviceName} "${websocketUri}"`);

        let resolveSocket: promiseResolver;

        // override socket ref, create a new promise
        [socketPromiseRef, resolveSocket] = createFlatPromise<WebSocket | null>();

        // attempt to create socket
        logger.debug(`Attempting to establish new socket "${websocketUri}"`)

        // This is the receviging socket, but we are only concerned with the endpoints
        const socket = new WebSocket(websocketUri);

        // bind listeners to this socket
        const onSocketInitErrorOrClose = (error : Error) => {
            logger.error(`Socket for "${websocketUri}" could not be established due to a connection error. Will reattempt on next heartbeat`);
            if (error?.message) logger.error(error.message);
            // detach existing listeners
            socket.removeEventListener('open', onSocketInitOpen);
            socket.removeEventListener('error', onSocketInitErrorOrClose);
            socketPromiseHasResolved = true;
            resolveSocket(null);
        }

        const onSocketInitOpen = () => {
            logger.debug(`Socket for "${websocketUri}" was successfully established. Artery is now active`);
            socket.removeEventListener('open', onSocketInitOpen);
            socket.removeEventListener('error', onSocketInitErrorOrClose);

            // Accepts incoming messages
            socket.addEventListener('message', handler.handleIncomingPayload); 

            socketPromiseHasResolved = true;
            resolveSocket(socket);
        }

        // bind initial listeners
        socket.addEventListener('open', onSocketInitOpen);
        socket.addEventListener('error', onSocketInitErrorOrClose);
        logger.debug(`Socket for "${websocketUri}" is outbound and waiting for a definitive result`);

        // return promise ref
        return socketPromiseRef;
    }

    function empty() {
        // Throw away the old socket ref
        logger.warning(`Artery accessor for service "${service.name}" has been discarded and will attempt on next heartbeat`)
        socketPromiseRef = null;
    }

    logger.debug(`Created artery accessor for service "${service.name}"`);

    return {
        handler,
        serviceName,
        getSocketOnlyIfActive,
        getSocketOrActivate,
        empty,
    }
}


async function sendWithAck(arterialSocket: WebSocket, payload: any[]) {
    const logger = log.getLogger('arterial');
    // To simulate a request/response mode on the socket, we can bind an acknowledge
    // When dispatching events to services through arterials, it's not needed - but it can be helpful
    // within the services themselves to see if a intent was received by the core
    logger.debug('ACK was requested - generating key and flattened Promise');
    const [ackPromise, ackKey] = createAckPromise(arterialSocket);
    logger.debug(`ACK was created @${ackKey} - sending`);
        
    arterialSocket.send(JSON.stringify({ payload, isBatch: payload.length > 1, ackKey }));

    // If specified, wait for ack
    await ackPromise;
    logger.debug(`ACK was received @${ackKey}`);

}

export function send(arterialSocket: WebSocket, payload: any[], options?: {
    waitForAck?: boolean;
}) {
    if (arterialSocket.readyState !== SOCKET_OPEN) {
        throw new Error('Socket closed');
    }
   
    if (options?.waitForAck) {
        // Use awk route (with Promise)
        return sendWithAck(arterialSocket, payload);
    }

    arterialSocket.send(JSON.stringify({ payload, isBatch: payload.length > 1 }));
}

/**
 * Converts the services Map into a Map of service names to their artery
 * @param serviceMap
 */
export function generateArterialMap(serviceMap: ServiceDefinitionMap, ozoneConfig: OzoneCoreConfiguration) {
    const arterialMap = new Map() as ArterialMap;

    for (const [serviceName, serviceDefinition] of serviceMap) {
        // create artery for this service, but don't do any async things yet (that's delegated to the core)
        arterialMap.set(serviceName, buildArteryInstance(serviceDefinition, ozoneConfig));
    }

    return arterialMap;
}
