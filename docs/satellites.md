# Developing using the Ozone satellite pattern

Ozone is best optimized to be used in a zoned configuration, while typically means services should only exist within the shared networked used by the container management, which in all but the most exoteric configurations would be on the same device or cluster.

Because Ozone uses dns to reach containers _it could_ be possible to use Ozone across multiple devices in a network (such as VPN), but for most systems- a web of satellite connections would be best.

## What is a satellite service?

If a Ozone service depends on compute power or external devices that aren't guaranteed to be on the same network, it's often easier to use the Ozone container service as a proxy to a remote system. Since the container is it's own device (from a very shallow perspective), making a remote network or device available to a specific container is possible and should be preferred.

Essentially, it's better to configure a service to reach a remote satellite service instead of trying to force Ozone to span across across unzoned boundaries, causing potential security risks and performance issues. The heartbeat system is fairly resilient, but if a remote service can't phone home in time then it can cause problems for the whole core.

## Coding for satellites

TBD - I need a fully featured prototype to determine viability and best practices for this pattern