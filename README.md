<div align="center">
  <a href="https://hackernoon.com/ozone-the-multi-instance-state-management-system-59ed2d7a104b">
    <img width=320" height="320" src="docs/logos/logo-bsd.png" />
  </a>
  <br>
  <h1>Ozone</h1>
  <p>An Event Driven Architecture (E.D.A) Framework for Deno services</p>
</div>

Ozone (the **O**mni-functional **Z**oned **O**perating **N**etwork **E**ngine) is a
secure integrated Deno architecture for communicating events (and primitive state) between instances using an event-driven architecture.

## What

In short, Ozone is:

- **A thin state and intent propagation system for containers.** Intents are event-like objects that get sent to the core instance and propagated to any services that are configured to receive those intents.

- **Expects and prefers to be run within a container engine that uses manifests.** Currently, compose manifests are implemented.

- **Powered by Deno** (for now). Intended to be consumed in a codebase as a git submodule as a easy way to lock in.

- Uses **Websockets** which Ozone refers to as **arteries**. If arterials are interrupted or disconnected become broken, we don't expect it to use it. If we are establishing a heartbeat, then we try to unclog/reestablish flow in the artery.

However, keep in mind that Ozone:

- **Does not use a retry scheduler or persistent queue.** If a intent does not make it to a service, the expectation is that developer error and Ozone will continue. This is because Ozone follows an arterial pattern instead of a traditional publisher/subscriber model.

  > See the [artery doc page](./docs/artery.md) for an explanation of how the Ozone intent model works and how communications and redundancy is meant to be handled.

- **Is not a replacement for a pubsub model or a full fledged event-bus.** Infrastructures where event data and delivery is mission-critical (i.e payment systems) and also idempotence should avoid using Ozone, which follows a FIFO model.

  > See the [architecture doc page](./docs/architecture.md) for a detailed implementation overview of what Ozone does from a technical perspective.

## Getting started

The repository [ozone-testing]() contains a working example of a service implementation used for manual testing and demonstration.

**Ozone needs the following:**
- A container management engine that works with compose, such as `podman` or `docker`
- A shared container secret `o3_key` - used to negotiate connections with the core and its services
- A network connection for live Deno dependency loading (note that in production configurations, you should be adding deps to your container images anyways)

**Ozone works best when used:**
- Within the same docker/podman network. Remote services are not implemented yet, but as a best practice - using a satellite service pattern can work around this.
  > Read about the [satellite pattern here](./docs//satellites.md)
- For systems that replicate human physicality. Use cases would include robotics and autonomy, and home automation. It does not incorporate designs needed for mission critical services.
