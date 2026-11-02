# Livestream cache investigation

The ATEM Mini Pro encodes video into a memory cache and sends it to YouTube over one TCP connection. The cache grows whenever that connection carries less than the encoder produces. So the question is what slows that one connection.

## Running it

Start this before the stream goes live, so there's a healthy baseline to compare against. Keep the Mac awake and on the church network.

```bash
cd ~/junk/livestream && caffeinate -i node monitor.mjs --until 12:30
```

It finds the ATEM by itself, or takes `--atem 10.0.0.169`. It only reads from the ATEM, and never sends it a command or logs the stream key. It does use one of the ATEM's client connections while running. When the cache reaches `--threshold` (default 5), it shows a Mac notification, records traceroutes and writes `logs/INCIDENT`.

```bash
cd ~/junk/livestream && node analyze.mjs
```

This compares each hop during every incident to the rest of the log, and prints a five-minute table.

## How to read an incident

| What the log shows | Most likely cause |
| --- | --- |
| Only `atem` is bad | The ATEM's cable, switch port or LAN segment |
| `router` is bad too | Could be just this Mac's Wi-Fi, so don't blame the LAN until it's confirmed from a wired connection |
| `isp` onward is bad | Upload saturated by something at church, the modem, or Spectrum's local network |
| `youtube` is bad, `cloudflare` is fine | The route to YouTube, or YouTube's edge |
| Everything is healthy | The ATEM's single connection: YouTube's ingest, its specific route, or the ATEM |

Limits of these measurements:

- Everything is measured from this Mac over Wi-Fi, so Wi-Fi hiccups show up on every hop. Idle pings already spike to 100-200 ms now and then.
- One ping per second can't see very low packet loss, and low loss can matter. TCP throughput falls as loss rises: at about 20 ms round trip, roughly 0.1% loss limits a classic TCP connection to around 20 Mbps, which is the ATEM's high setting. So "every hop healthy" doesn't clear the network completely.
- The cache value's unit isn't confirmed. It's probably a percentage, and today's first stream will show its range.
- Pings to `a.rtmp.youtube.com` may reach a different Google server than the one the ATEM is connected to.

## During an incident, by hand

These are the things the monitor can't see:

1. YouTube Studio's stream health panel: note its messages and timestamps.
2. The router's per-device traffic page: is anything else uploading heavily?
3. The modem's status or log page: any upstream errors or reconnects?

## Findings so far (2026-11-01, before the service)

- ATEM Mini Pro at 10.0.0.169, control link healthy, stream idle.
- Its stream goes to `a.rtmp.youtube.com` with bitrates of 12 Mbps (low) and 20 Mbps (high). Which one is in use will show in the log once the stream starts.
- Upload measured about 100 Mbps at 9:25 with the stream idle, from the Mac over Wi-Fi. That's a floor, because latency to the router itself rose under the test, so the Wi-Fi was probably the limit. Plain lack of upload capacity looks unlikely at that hour, though it wasn't tested while people were arriving.
- Idle round trip is about 21 ms to YouTube and 22 ms to Cloudflare, with no meaningful loss.
- The connection is Spectrum (AS20115).

## First incident (2026-11-01, 10:17-10:22, before the 10:30 service)

- The stream started at 10:17:23 encoding about 11 Mbps, and the cache rose about 1% per second, reaching 100 at 10:19:13.
- It was restarted by hand at about 10:19:30. The cache came back at 39, climbed at about the same rate, and reached 100 again at 10:20:35.
- At 10:21:12 it fell to 74 by itself, then drained. It's been steady at 3 since about 10:22 at about 11 Mbps. Nothing is known to have changed at that moment. A capped upload test from the Mac began within a second of it, which is most likely coincidence.
- The Mac's Wi-Fi was bad from 10:07 to about 10:20 (it dropped to 2.4 GHz at 10:11, with bursts of 80-97% loss). It wasn't the cause: from about 10:20 the Mac had normal latency and little loss to every hop, while the cache kept filling.
- During the 10:21 test the Mac sustained about 12 Mbps to Cloudflare with normal latency, while the ATEM's connection was still struggling.
- The cache really is a percentage, since it stops at exactly 100. A healthy stream appears to sit at about 3.
- While the cache drained at about 12.5 Mbps encoding, the ATEM must have been sending faster than that, so its link isn't permanently limited.
- The state shows one-second "idle" blips during the stream (10:17:36, 10:18:02, 10:19:26, 10:20:36, 10:21:08). What they mean is unknown. The 10:21:08 one came four seconds before the sudden drop.
- Still unknown: how the ATEM connects to the router, and what YouTube Studio's stream health showed during those minutes.

## Open questions

- **Is it a slow start?** Both fills began the moment the stream did. Log more starts. A test stream 30 minutes early, when the building is empty, would separate "every stream starts this way" from "only when the room fills up".

- **Is it worse around 10:30?** Compare the five-minute table across 10:30 and across several Sundays. One Sunday can't settle this.
- **Does it follow the bitrate?** If incidents continue, try the lower bitrate for a few weeks. Change only one thing at a time, and not until there's a baseline.

## YouTube Studio messages

- 2026-11-01, after the cache cleared at about 10:22: "The stream's current bitrate (10757.20 Kbps) is higher than the recommended bitrate". That figure matches the ATEM's encoder at about 11 Mbps, so YouTube was receiving the full stream at that point.
- The same message went on: "We recommend that you use a stream bitrate of 6800 Kbps". The ATEM's two stored settings are 12 and 20 Mbps, and it was encoding 11-13 Mbps, so neither stored setting is near that. Try about 6.8 Mbps as the next experiment.

## Rest of the 2026-11-01 service

- From 10:22:30 until the monitor stopped at 12:14, the cache never went above 3, with no state blips and no ATEM link drops. The stream averaged 11.2 Mbps, ranging from 3.1 to 16.6.
- In that time, pings from the Mac lost 2 of 6712 to the router, 2 of 6711 to the ATEM, 67 of 6711 to YouTube and 4 of 6711 to Cloudflare. YouTube's ping loss was about 1%, which is more than Cloudflare's, but it didn't affect the stream.
- `analyze.mjs` blames the router for the morning incident, because the whole window includes the Mac's bad Wi-Fi. The timeline above is the better account: the cache kept filling after the Mac recovered.
- Worth finding out: what happens at church from about 10:07 to 10:20, when the Mac's Wi-Fi was bad.
- The ATEM is on Ethernet, and Andrew doesn't think there's any wireless link between it and the router (not yet traced end to end). So the Mac's Wi-Fi trouble shouldn't have reached the ATEM directly. What they share is the router and whatever switches are in the path, so check whether the router was overloaded from 10:07 to 10:20.
