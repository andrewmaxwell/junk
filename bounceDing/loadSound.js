export const loadSound = async (url) => {
  const audioCtx = new AudioContext();
  const audioBuffer = await audioCtx.decodeAudioData(
    await (await fetch(url)).arrayBuffer()
  );

  const play = (pitch = 1) => {
    const source = audioCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.playbackRate.value = pitch;
    source.connect(audioCtx.destination);
    source.start();
  };

  return {play};
};
