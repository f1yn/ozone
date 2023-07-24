# Arterial thinking

Ozone was designed to respond and delgate events in the same way a human body distributes blood (which contains things like state through hormones), and signals (like muscle movement and response though the nervous system).

Unlike traditional publisher-subscriber models, Ozone does not backlog missed intents or state updates to services. The reason for this is simply because if communication through an arterial socket is interrupted, it can be assumed that the zoning has failed, and that the service is no longer connected.

Just like how a severed limb on the human body will not continue to receive oxygen or chemicals through the blood, or messages through the nervous system - ozone services will behave the same way.

## The role of the heartbeat

On a given interval, Ozone will send a heartbeat down every arterial it expects to be active, and will try to activate arteries that aren't active. If the artery fails, it sets itself to a "not available" state, which will attempt to re-establish on the following heartbeat.

If a limb on a human body suddenly becomes "unavailable", and no measures to rectify that situation were taken (i.e cauterization or replacement): there's an expectation that eventually, the heartbeat will lead that body into a state where it will not be able to continue. The human body will stop.

Ozone mimics this behavior. If an artery is severed, and can't re-connect after several more heartbeats, the default behavior for Ozone is to ultimately kill the core process. The heartbeat is used to track how many times a service consecutively is not responding.

## Limbs continue to exist, even if the core does not.

If a person is "brought back to life," the limbs that were already there will continue to function in that given capacity. Assuming their body isn't maimed, severely crippled, or like-wise in a state of severe atrophy - the expectation is that the person brought back to life will be able to fully use their limbs.

Ozone behaves the same way. When the core reboots, it will attempt to connect to existing services that - given the services were started using a manifest, should be still running or in a state where they are rebooting. The Ozone service will consistently wait for the next upstream core connection after it's been severed - so services don't need to "know" that Ozone has failed.

## There's no "everything is ready" intent

Arteries don't know when other arteries are "ready" for the first time and that's intentional. The reason for this is because of the shared state system used by Ozone. IF a service isn't ready, it's initial state will not yet be populated by Ozone until the initial heartbeat is established through he artery.
