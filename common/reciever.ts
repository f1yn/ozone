
type receiverFunction = (socket: WebSocket, ozonePayload: any) => Promise<false | void>;

/**
 * Creates a processing chain for incoming Webhook messages so we can intercept, and cancel propagation if we wish
 * @returns 
 */
export function createMessageReceiver() {
    const receiverSet = new Set<receiverFunction>();

    /**
     * Async thread that processes each handler asynchronously
     * @param socket 
     * @param parsedData 
     * @returns 
     */
    async function handleIncomingAsync(socket: WebSocket, parsedData : any) {
        for (const receiver of receiverSet) {
            const shouldContinue = await receiver(socket, parsedData);

            if (shouldContinue === false) {
                // TODO: log this - bail out
                return;
            }
        }
    }

   function handleIncomingPayload(this: WebSocket, originalMessage: MessageEvent) {
        // We should only need to parse this one
        const parsedData = JSON.parse(originalMessage.data);
        // TODO: error catch and log
        handleIncomingAsync(this, parsedData);
    }

    return {
        handleIncomingPayload,
        addReceiver(receiverToAdd: receiverFunction) {
            receiverSet.add(receiverToAdd);
        },
        removeReceiver(receiverToRemove: receiverFunction) {
            receiverSet.delete(receiverToRemove);
        }
    }
}