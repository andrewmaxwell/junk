const colors = {
  primary_link: '#F00', // red
  motorway_link: '#FF0', // yellow
  residential: 'green', // lime
  tertiary: '#0FF', // cyan
  primary: '#00F', // blue
  secondary: '#F0F', // magenta
  motorway: 'black', // white
  road: 'white' // black
};

export class MapRenderer {
  constructor(canvas, opts) {
    this.canvas = canvas;
    this.context = this.canvas.getContext('2d');
    this.opts = opts;
  }
  resize(width, height) {
    this.canvas.width = width;
    this.canvas.height = height;
    this.draw();
  }
  draw() {
    const T = this.context;
    const roads = this.opts.roads;
    const selected = this.opts.selected;

    const drawLine = nodes => {
      T.moveTo(nodes[0].screenX, nodes[0].screenY);
      for (let i = 1; i < nodes.length; i++) {
        T.lineTo(nodes[i].screenX, nodes[i].screenY);
      }
    };

    T.clearRect(0, 0, this.canvas.width, this.canvas.height);

    if (roads) {
      if (roads[0].type) {
        for (let i = 0; i < roads.length; i++) {
          T.beginPath();
          T.strokeStyle = colors[roads[i].type];
          drawLine(roads[i].nodes);
          T.stroke();
        }
      } else {
        T.lineWidth = 0.25;
        T.strokeStyle = 'white';
        T.beginPath();
        for (let i = 0; i < roads.length; i++) {
          drawLine(roads[i].nodes);
        }
        T.stroke();

        // const onewayRoads = roads.filter(r => r.oneway);
        // const goingNorth = [], goingSouth = [];
        // for (let i = 0; i < onewayRoads.length; i++){
        // 	let n = onewayRoads[i].nodes;
        // 	for (let j = 0; j < n.length - 1; j++){
        // 		let a = n[j], b = n[j + 1];
        // 		if (a.y < b.y){
        // 			goingSouth.push([a, b]);
        // 		} else {
        // 			goingNorth.push([a, b]);
        // 		}
        // 	}
        // }
        //
        // T.strokeStyle = '#F00';
        // T.beginPath();
        // goingNorth.forEach(([a, b]) => {
        // 	T.moveTo(a.screenX, a.screenY);
        // 	T.lineTo(b.screenX, b.screenY);
        // });
        // T.stroke();
        //
        // T.strokeStyle = '#00F';
        // T.beginPath();
        // goingSouth.forEach(([a, b]) => {
        // 	T.moveTo(a.screenX, a.screenY);
        // 	T.lineTo(b.screenX, b.screenY);
        // });
        // T.stroke();

        // T.fillStyle = '#888';
        // T.beginPath();
        // for (let i = 0; i < roads.length; i++){
        // 	let n = roads[i].nodes;
        // 	for (let j = 0; j < n.length; j++){
        // 		T.rect(n[j].screenX - 1, n[j].screenY - 1, 2, 2);
        // 	}
        // }
        // T.fill();
      }
    }

    if (selected) {
      T.lineWidth = 0.5;
      T.strokeStyle = 'blue';
      T.beginPath();
      for (let i = 1; i < selected.length; i++) {
        for (let j = 0; j < i; j++) {
          let path =
            selected[i].paths &&
            selected[i].paths[selected[j].id] &&
            selected[i].paths[selected[j].id].path;
          if (path) drawLine(path);
        }
      }
      T.stroke();

      T.fillStyle = 'red';
      T.beginPath();
      for (let i = 0; i < selected.length; i++) {
        T.rect(selected[i].screenX - 3, selected[i].screenY - 3, 6, 6);
      }
      T.fill();
    }
  }
}
