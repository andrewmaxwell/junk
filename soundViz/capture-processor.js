// AudioWorklet that ships raw mic samples to the main thread. Outputs silence.
class CaptureProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) this.port.postMessage(new Float32Array(ch));
    return true;
  }
}
registerProcessor('capture-processor', CaptureProcessor);
