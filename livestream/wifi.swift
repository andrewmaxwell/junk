// Prints the Wi-Fi signal as JSON without scanning, unlike system_profiler,
// which stalls the Mac's Wi-Fi for a few seconds. monitor.mjs compiles it.
import CoreWLAN
let i = CWWiFiClient.shared().interface()
let ch = i?.wlanChannel()
print("{\"rssi\":\(i?.rssiValue() ?? 0),\"noise\":\(i?.noiseMeasurement() ?? 0),\"rate\":\(Int(i?.transmitRate() ?? 0)),\"channel\":\(ch?.channelNumber ?? 0),\"band\":\(ch?.channelBand.rawValue ?? 0)}")
