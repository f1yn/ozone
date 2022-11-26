import { log } from './deps.ts';

// TODO: Move these to shared types
import { ServiceDefinition } from '../../core/loadServices.ts';
import { OzoneCoreConfiguration } from '../../core/loadConfiguration.ts';

const SOCKET_CONNECTING = 0;
const SOCKET_OPEN = 1;
const SOCKET_CLOSING = 2;
const SOCKET_CLOSED = 3;

export function buildArteryInstance(service: ServiceDefinition, ozoneConfig: OzoneCoreConfiguration) {
    const logger = log.getLogger('arterial');

    const serviceName = service.name;
    const serviceTargetHostname = service.hostname;
    const websocketUri = `ws://${serviceTargetHostname}:${ozoneConfig.socketPort}`;

    // Use a promise-ref to allow promise-splitting (multiple calls will resolve the same promise)
    let socketPromiseRef;
    let socketPromiseHasResolved;

    async function getOnlyIfActive() {
        const activeSocket = socketPromiseRef && (await socketPromiseRef);

        if (activeSocket && activeSocket.readyState === SOCKET_OPEN) {
            logger.debug(`Live artery available, returning result ARTERY=@${serviceName}`);
            return activeSocket;
        }

        logger.info(`An existing artery was not ready for ARTERY=@${serviceName}, attempting new connection`);

        return null;
    }

    async function getOrActivate() {
        logger.debug(`getOrActivate() was called for ARTERY=@${serviceName}`);

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

        // override socket ref, create a new promise
        socketPromiseHasResolved = false;
        socketPromiseRef = new Promise((resolve, reject) => {
            // attempt to create socket
            logger.debug(`Attempting to establish new socket "${websocketUri}"`)
            let socket = new WebSocket(websocketUri);

            // bind listeners to this socket
            let onSocketInitErrorOrClose;
            let onSocketInitOpen;

            onSocketInitErrorOrClose = (error) => {
                logger.error(`Socket for "${websocketUri}" could not be established due to a connection error. Will reattempt on next heartbeat`);
                if (error?.message) logger.error(error.message);
                // detach existing listeners
                socket.removeEventListener('open', onSocketInitOpen);
                socket.removeEventListener('error', onSocketInitErrorOrClose);
                // socket.removeEventListener('close', onSocketInitErrorOrClose);
                socketPromiseHasResolved = true;
                resolve(null);
            }

            onSocketInitOpen = () => {
                logger.debug(`Socket for "${websocketUri}" was successfully established. Artery is now active`);
                socket.removeEventListener('open', onSocketInitOpen);
                socket.removeEventListener('error', onSocketInitErrorOrClose);
                // socket.removeEventListener('close', onSocketInitErrorOrClose);
                socketPromiseHasResolved = true;
                resolve(socket);
            }


            // bind initial listeners
            socket.addEventListener('open', onSocketInitOpen);
            socket.addEventListener('error', onSocketInitErrorOrClose);
            // socket.addEventListener('close', onSocketInitErrorOrClose);
            logger.debug(`Socket for "${websocketUri}" is outbound and waiting for a definitive result`);
        });

        // return promise ref
        return socketPromiseRef;
    }

    async function send() {

    }

    async function sendBatch() {

    }

    logger.debug(`Created artery accessor for service "${service.name}"`);

    return {
        serviceName,
        getOnlyIfActive,
        getOrActivate,
        send,
        sendBatch,
    }
}