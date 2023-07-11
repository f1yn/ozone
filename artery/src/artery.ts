import { log } from './deps.ts';

// TODO: Move these to shared types
import { ServiceDefinition } from '../../core/loadServices.ts';
import { OzoneCoreConfiguration } from '../../core/loadConfiguration.ts';

import { createFlatPromise, promiseResolver } from '@o3/common/promise.ts';
import { createAckPromise } from '@o3/common/ack.ts';

// const SOCKET_CONNECTING = 0;
const SOCKET_OPEN = 1;
// const SOCKET_CLOSING = 2;
// const SOCKET_CLOSED = 3;

/**
 * Creates an artery from the core to a specific Ozone service. Returns getter functions that will return the socket if it exists
 * @param service 
 * @param ozoneConfig 
 * @returns 
 */
export function buildArteryInstance(service: ServiceDefinition, ozoneConfig: OzoneCoreConfiguration) {
    const logger = log.getLogger('arterial');

    const serviceName = service.name;
    const serviceTargetHostname = service.hostname;
    const websocketUri = `ws://${serviceTargetHostname}:${ozoneConfig.socketPort}`;

    // Use a promise-ref to allow promise-splitting (multiple calls will resolve the same promise)
    let socketPromiseRef : Promise<WebSocket | null>;
    let socketPromiseHasResolved : boolean;
    
    // TODO: flatten all this junk

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
        let socket = new WebSocket(websocketUri);

        // bind listeners to this socket
        let onSocketInitErrorOrClose : (error: Error) => void;
        let onSocketInitOpen : () => void;

        onSocketInitErrorOrClose = (error : Error) => {
            logger.error(`Socket for "${websocketUri}" could not be established due to a connection error. Will reattempt on next heartbeat`);
            if (error?.message) logger.error(error.message);
            // detach existing listeners
            socket.removeEventListener('open', onSocketInitOpen);
            socket.removeEventListener('error', onSocketInitErrorOrClose);
            socketPromiseHasResolved = true;
            resolveSocket(null);
        }

        onSocketInitOpen = () => {
            logger.debug(`Socket for "${websocketUri}" was successfully established. Artery is now active`);
            socket.removeEventListener('open', onSocketInitOpen);
            socket.removeEventListener('error', onSocketInitErrorOrClose);
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

    logger.debug(`Created artery accessor for service "${service.name}"`);

    return {
        serviceName,
        getSocketOnlyIfActive,
        getSocketOrActivate,
    }
}

// TODO: experimental: allow for different content types for intents (i.e binary blob)
interface sendOptions {
    isBatch?: boolean;
    waitForAck?: boolean;
}

export async function send(arterialSocket: WebSocket, payload: any[], options?: sendOptions) {
    // To simulate a request/response mode on the socket, we can bind an acknowledge
    // When dispatching events to services through arterials, it's not needed - but it can be helpful
    // within the services themselves to see if a intent was received by the core
    let ackPromise, ackKey;
    if (options?.waitForAck) {
        [ackPromise, ackKey] = createAckPromise(arterialSocket);
    }
    
    arterialSocket.send(JSON.stringify({ payload, isBatch: Boolean(options?.isBatch), ackKey }));

    // If specified, wait for ack
    if (ackPromise) await ackPromise;
}

export type Artery = ReturnType<typeof buildArteryInstance>;
