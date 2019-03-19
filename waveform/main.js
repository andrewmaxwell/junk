var C = document.querySelector('canvas');
var T = C.getContext('2d');
var a = new AudioContext();
var analyzer = a.createAnalyser();
var num = analyzer.frequencyBinCount;
var dataArray = new Float32Array(num);
var W, H;

window.onresize = () => {
  W = C.width = innerWidth;
  H = C.height = innerHeight * 1.5;
  T.strokeStyle = 'white';
};

window.onkeypress = async () => {
  window.onkeypress = null;

  var stream = await navigator.mediaDevices.getUserMedia({audio: true});
  a.createMediaStreamSource(stream).connect(analyzer);

  var loop = () => {
    requestAnimationFrame(loop);
    analyzer.getFloatTimeDomainData(dataArray);

    T.drawImage(C, 0.1, -0.5);
    T.beginPath();
    T.lineTo(W, H);
    T.lineTo(0, H);
    for (var i = 0; i < num; i++) {
      T.lineTo((i / num) * W, (dataArray[i] + 0.5) * H);
    }
    T.fill();
    T.stroke();
  };

  loop();
};

window.onresize();
T.fillText('Press any key to start.', 100, 100);
