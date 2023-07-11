

export type promiseResolver = <T>(value: T | PromiseLike<T>) => void
export type promiseRejector = (reason: Error) => void;

interface flatPromiseCallbackRefs<T> {
    resolve: promiseResolver;
    reject: promiseRejector;
}

/**
 * TODO: Impl timeout
 * Returns a flattened promise than can be manually resolved or rejected without a complex closure
 * @returns 
 */
export function createFlatPromise<T>() : [Promise<T>, promiseResolver, promiseRejector]{
    const callbackRefs = {} as flatPromiseCallbackRefs<T>;
    const promise = new Promise<T>((resolve, reject) => {
        callbackRefs.resolve = resolve as promiseResolver;
        callbackRefs.reject = reject;
    });
    return [promise, callbackRefs.resolve, callbackRefs.reject];
}