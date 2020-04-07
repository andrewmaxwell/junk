const {assocPath, path, pipe, dissocPath, append} = window.R;

const dropZoneHeight = 40;
const spacing = 20;
const gray = 'rgba(0,0,0,0.16667)';

const inBox = (mx, my, bx, by, bw, bh) =>
  mx >= bx && my >= by && mx < bx + bw && my < by + bh;

const pieceText = p =>
  p.type === 'string' ? `"${p.value}"` : p.value || p.type;

const makeExprBuilder = ({canvas}) => {
  const {width, height} = canvas;
  const ctx = canvas.getContext('2d');
  ctx.font = '14px sans-serif';
  ctx.textBaseline = 'middle';
  let pieces = [
    {
      type: 'AND',
      x: 50,
      y: 50,
      args: [
        {
          type: 'NOT IN',
          args: [
            {type: 'LOWERCASE', args: [{type: 'string', value: 'B'}]},
            {type: 'field', value: 'pname'}
          ]
        },
        {
          type: '>',
          args: [
            {type: 'field', value: 'year'},
            {type: 'number', value: '2020'}
          ]
        }
      ]
    }
  ];
  let dragPath;
  let dropZonePath;

  const drawPiece = (p, mouse = {}, path) => {
    if (!p.type) {
      if (dragPath) {
        const overDrop = inBox(mouse.x, mouse.y, p.x, p.y, p.w, p.h);
        if (overDrop) dropZonePath = path;
        ctx.fillStyle = `rgba(0,0,255,${overDrop ? 0.5 : 0.1}`;
        ctx.fillRect(p.x, p.y, p.w, p.h);
      }
      return;
    }

    for (let i = 0; p.args && i < p.args.length; i++) {
      drawPiece(p.args[i], mouse, [...path, 'args', i]);
    }

    ctx.fillStyle = gray;
    ctx.strokeStyle = 'black';
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    if (p.args) {
      ctx.lineTo(p.x + p.w + spacing, p.y);
      for (const s of p.args) {
        ctx.lineTo(p.x + p.w + spacing, s.y);
        ctx.lineTo(p.x + p.w, s.y);
        ctx.lineTo(p.x + p.w, s.y + s.h);
        ctx.lineTo(p.x + p.w + spacing, s.y + s.h);
      }
      ctx.lineTo(p.x + p.w + spacing, p.y + p.h);
    } else {
      ctx.lineTo(p.x + p.w, p.y);
      ctx.lineTo(p.x + p.w, p.y + p.h);
    }
    ctx.lineTo(p.x, p.y + p.h);
    ctx.lineTo(p.x, p.y);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = 'black';
    ctx.fillText(pieceText(p), p.x + 5, p.y + p.h / 2);
  };

  const setCoords = (p, x, y) => {
    p.x = x;
    p.y = y;
    p.w = ctx.measureText(pieceText(p)).width + 15;
    if (p.args) {
      let sy = spacing;
      for (const s of p.args) {
        setCoords(s, x + p.w, y + sy);
        sy += s.h + spacing;
      }
      p.h = sy;
    } else {
      p.h = dropZoneHeight;
    }
  };

  const draw = mouse => {
    dropZonePath = null;
    ctx.clearRect(0, 0, width, height);
    for (let i = 0; i < pieces.length; i++) {
      const p = pieces[i];
      setCoords(p, p.x, p.y);
      drawPiece(p, mouse, [i]);
    }
  };

  const getPiecePath = (x, y, arr = pieces) => {
    for (let i = 0; i < arr.length; i++) {
      const p = arr[i];
      if (inBox(x, y, p.x, p.y, p.w, p.h)) return [i];
      if (p.args) {
        const a = getPiecePath(x, y, p.args);
        if (a) return [i, 'args', ...a];
      }
    }
  };

  canvas.addEventListener('mousedown', ({which, offsetX, offsetY}) => {
    if (which !== 1) return;
    dragPath = getPiecePath(offsetX, offsetY);
    draw();
  });
  canvas.addEventListener('mouseup', () => {
    if (dragPath && dropZonePath) {
      const drag = path(dragPath, pieces);
      pieces = pipe(
        assocPath(dropZonePath, drag),
        dissocPath(dragPath)
      )(pieces);
    }
    dragPath = null;
    draw();
  });
  canvas.addEventListener(
    'mousemove',
    ({offsetX, offsetY, movementX, movementY}) => {
      if (dragPath) {
        const drag = path(dragPath, pieces);
        if (dragPath.length > 1) {
          pieces = pipe(assocPath(dragPath, {}), append(drag))(pieces);
          dragPath = [pieces.length - 1];
        }
        drag.x += movementX;
        drag.y += movementY;
        draw({x: offsetX, y: offsetY});
      } else {
        canvas.style.cursor = getPiecePath(offsetX, offsetY)
          ? 'move'
          : 'default';
      }
    }
  );

  draw();
};

makeExprBuilder({
  canvas: document.querySelector('canvas'),
  onChange: expr => (location.hash = JSON.stringify(expr)),
  initialExpr: location.hash ? JSON.parse(location.hash.slice(1)) : undefined
});
