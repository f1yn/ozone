import { EventEmitter } from "node:events";
import { OZONE_SOCKET_PORT, OZONE_SECRET_NAME } from '@o3/core/constants.ts';
import { createFlatPromise } from '@o3/common/promise.ts';
import { createMessageReceiver } from '@o3/common/reciever.ts';
import { receiveIncomingAck } from '@o3/common/ack.ts';
import { http } from './deps.ts';

export const intentEmitter = new EventEmitter();

interface ServiceInternalServer {
    currentSocket: WebSocket | null;
    firstConnectionWasEstablished: boolean;
}

const internal: ServiceInternalServer = {
    currentSocket: null,
    firstConnectionWasEstablished: false,
};

/**
 * Internal server loop function. Will only resolve when the active sockets are closed, or other errors
 * @param secret 
 * @param onInitialConnect 
 * @returns 
 */
async function activeServerOrFail(secret: string, onInitialConnect: () => void): Promise<null> {
    // TODO: Enforce secret
    const [serverPromise, resolveServerPromise] = createFlatPromise<null>();
    const handler = createMessageReceiver();

    // Check for incoming ack and reply as needed
    handler.addReceiver(receiveIncomingAck);

    // Add events to the internal emitter (for intent listening)
    handler.addReceiver(async (_socket, { payload }) => {
        // TODO: Promise.all?
        for (const intent of payload) {
            await intentEmitter.emit(intent.intent, intent.data)
        }
    });

    try {
        // TODO: TLS
        await http.serve((req) => {
            // Wait for upgrade
            if (req.headers.get("upgrade") != "websocket") {
                return new Response(null, { status: 501 });
            }
            // If the upgrade was requested, try and do that
            const { socket, response } = Deno.upgradeWebSocket(req);

            socket.addEventListener("open", () => {
                // TODO: Should we handle this case (core should not open more than one socket at a time)
                if (internal.currentSocket) return;
                // Set ref
                internal.currentSocket = socket;
                // If it's the first time we've connected, our parent needs to resolved while we still run
                if (!internal.firstConnectionWasEstablished) {
                    internal.firstConnectionWasEstablished = true;
                    onInitialConnect();
                }
            });

            socket.addEventListener('close', () => {
                // Unset the currentSocket ref
                internal.currentSocket = null;
                // Since we only resolve when the socket closes, this would be now
                resolveServerPromise(null);
            });

            // Add receiver
            socket.addEventListener("message", handler.handleIncomingPayload);

            return response;
        }, { port: OZONE_SOCKET_PORT })
    } catch(coreServerError) {
        // Server failed to bind port, failover will empty promise
        internal.currentSocket = null;
        console.error(coreServerError);
        resolveServerPromise(null);
        return serverPromise;
    }

    // TODO: Cleanup on failure (clean up handles and mutable states)
    // I don't trust GC to do it's job.

    return serverPromise;
}

/**
 * The actual server loop - used to maintain and reestablish a socket without summoning the demonic
 * callback hell demons
 * @param onInitialConnect 
 */
async function activeServerLoop(onInitialConnect: () => void) {
    // load secret
    const secret = await Deno.readTextFile(`/run/secrets/${OZONE_SECRET_NAME}`);

    // TODO: Add maxRetries that resets after connection has been established for more than
    // a configurable amount of time.
    while (true) {
        // This function will only resolve after a fail state
        await activeServerOrFail(secret, onInitialConnect);

        // If we reach here, it means the server disconnected or failed
        console.error('Unable to connect. Retrying in a few moments');

        // TODO: Implement new constant for interval
        await setTimeout(() => new Promise<void>(resolve => resolve()), 2000);
    }
}


/**
 * 
 * @returns
 */
export function getCurrentSocket() {
    return internal.currentSocket;
}

export async function initServerServiceLoop() {
    // TODO: Implement timeout here if the options
    const [firstConnection, resolveFirstConnection] = createFlatPromise<null>();

    // Background loop (resolves on first connection)
    activeServerLoop(() => resolveFirstConnection(null));

    await firstConnection;
}
