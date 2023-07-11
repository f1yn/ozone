import { createFlatPromise } from "./promise.ts";

const ACK_INCOMING_KEY = 'ackKey';
const ACK_REPLY_KEY = 'ackReplyKey';

/**
 * Subscribes and waits for acknowledgement after a send or batch send
 * @param arterialSocket 
 */
export function createAckPromise(arterialSocket : WebSocket) {
    console.log('WAITING FOR ACK')

    const ackKey = crypto.randomUUID();
    const [ackPromise, resolveAck] = createFlatPromise<boolean>();
    
    function waitForAck(incomingPayload : any) {
        const response = JSON.parse(incomingPayload.data);
        if (response[ACK_REPLY_KEY] === ackKey) return;

        // resolve and unreg this callback
        arterialSocket.removeEventListener('message', waitForAck);
        console.log('ACK!');
        resolveAck(true);
    }

    // TODO: Move this to some sort of Set-based callbacks - we shouldn't need to parse the JSON multiple times
    arterialSocket.addEventListener('message', waitForAck);

    return [ackPromise, ackKey];
}

/**
 * Processes an incoming Ack and replies if asked. Should be added to the receive hook early
 */
export async function receiveIncomingAck(socket: WebSocket, eventData: any) {
    if (eventData[ACK_INCOMING_KEY]) {
        console.log('SOMEONE ASKED US FOR AN ACK - LETTING THEM KNOW ITS ALL GOOD')
        // Someone might be asking us for an awk
        await socket.send(JSON.stringify({ [ACK_REPLY_KEY]: eventData[ACK_INCOMING_KEY] }))
    }

    if (eventData[ACK_REPLY_KEY]) {
        // If we are getting an awk response (after sending one) - we we get here we don't continue processing
        console.log('WE GOT AN ACK BACK - CANCEL RECEIVER PROPAGATION')
        return false;
    }
}