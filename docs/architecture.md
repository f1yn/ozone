# Architecture

> This entire section will eventually be moved to `/docs`, but it here to ease redevelopment

Service management, log filtering w/ auto-rotation, sandboxing, and ultimately building secure services from-scratch
is daunting. Thankfully, some really smart and talented people already solved most of these issues using a technology
called containers.

For a few years, I've tested and also driven earlier iterations of this software that tried to solve too many problems at
once - but now I've realized it's better to build better practices on-top of already known best  practices, instead of
reinventing everything from the ground-up. 

## Networking
Every service in Ozone, assumes it's running within a container on a shared network. This provides many advantages, but the
most important to Ozone are being able to resolve containers (or their clusters) by-name via DNS lookups, and having
distinct isolation from the host network. **Ozone makes the assumption that services, unless explicitly specified, are internal
nodes and have no real intention of exposing ports to the outside world on their own.**

## Core node, heartbeat and pulse
Within this shared network, Ozone has a primary **Core node**. This core node operates in isolation, **without any dependencies
on other services in the system.** If the core node goes up, it will attempt to broadcast to each service within it's known
definitions that it's requesting a **heartbeat**, and once each service does this for the first time, it will send a `CORE_STABLIZED`
intent to all services it knows about. Each heartbeat attempt will attempt to establish a websocket connection to that service
if one could not be established already. Heartbeat requests go out on a determinate interval, and the average latency of
the responses is called the **pulse**. Later iterations of Ozone will be able to dispatch events based on the changes in pulse
(i.e dropping pulse-rate, pulse going up or flat-lining).

These ongoing socket connections are named **arteries**, as the system will eventually die if these arteries are severed
without restoration. If a specific service (or set of services) are, for some reason, _expected to intermittently fail_: a zombie
state can be used to force Ozone to function without the full-allocation of services, but this is **not advisable**.

Each heartbeat will contain the most recent state reflected by the core, and the last time it was updated. In future versions
of Ozone, the heartbeat can be configured to also send batches of events instead of FIFO (which should benefit ephemeral
services that could be prone to starting/stopping).

## Event dispatching

### Events from services to the core (service outgoing, core incoming)
- (S) Event payloads are given a timestamp when they are built
- (S) Outgoing events are first added to an outgoing queue before being sent to the core.
- (S) If the core can't be reached, or the socket closes, will not send events until the socket opens again.
- (S) If the service reaches either, a determinate critical mass of backlog or a time-based offset from last heartbeat, the service
  _can_ be configured to self-destruct, causing the host's service management to step in and perform necessary actions.
- (C) The core will process events in a FIFO manner when possible, it wants to process events as soon as they arrive.
- (C) Each event received will be added to queue for each known service. In later versions of Ozone, an option to provide a limited
  set of subscriptions will be provided - limited the amount of cloned events.
- (C) Later versions of Ozone will add persistence integration, only for archival purposes.


### Events sent from the core to services (core outgoing, service incoming)
- (C) All events created from incoming events, will be given an optional `sendAfter` which represents the minimum future time that an
event can be resent to a service. **Each outgoing call will check for backlogged items, and if the sendAfter is present will attempt to resend.**
- (C) The core will first send events in a FIFO manner. It does not care about time ordering, as this is the responsibility of each service
- (C) The core will never assume a service is inactive based on a lack of receipt to a service. Instead, it will save the event to backlog with the `sendAfter`
  set to the same duration as the heartbeat.
- (C) Even if the event handler on a service fails, the event will still be removed from the queue. It's not Ozone's responsibility to make
  badly built services less flakey. A severe warning will be showed if a service is badly implemented, or breaks at this point (Received, but not processed)
- (C) Unless configured otherwise, services will execute events concurrently on the event loop when possible.

## State synchronisation
If a heartbeat is sent that has the `requestingState: true` flag set to true, it will request the most recent state from services.
This is required for initial state, in both first-boot and restart situations where the core instance was manually interrupted, or
unexpectedly closed. These states will be merged to form a a full-state, representative of published state from all of the services.

**Using state or stateful operations is NOT required to use Ozone, but for non-clustered implementations it provides a way to perform
*informed* event handling.** For clustered implementations, it will also be possible to request a retrieve state from the core to get
the most recent state at time of call.

