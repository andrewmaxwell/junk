import {StatCanvas} from './StatCanvas.js';
import {ParticleSimulator} from './ParticleSimulator.js';
import 'https://code.jquery.com/jquery-3.3.1.slim.min.js';
const {$} = window;

(function() {
  var canvas = document.getElementById('C'),
    context = canvas.getContext('2d'),
    timerCanvas = document.getElementById('timerCanvas'),
    timer = StatCanvas({
      canvas: timerCanvas,
      color: 'rgba(255,255,255,0.5)',
      multiplier: 0.5,
      displayAverage(avg) {
        return Math.round(1000 / avg) + ' fps';
      }
    }),
    // statsCanvas=document.getElementById("statsCanvas"),
    // stats=StatCanvas({
    // canvas: statsCanvas,
    // color: "rgba(255,0,0,0.5)",
    // multiplier: 0.0003,
    // displayAverage: function(avg){
    // return Math.round(avg)+" collisions/frame"
    // }
    // }),

    maxParticles = 40000,
    simulator = ParticleSimulator(
      $(window).width(),
      $(window).height(),
      maxParticles
    ),
    prevTime = new Date(),
    loop = function() {
      var time = new Date();
      if (time - prevTime < 1000) timer.tick(time - prevTime);
      prevTime = time;

      requestAnimationFrame(loop, canvas);
      simulator.tick();
      // stats.tick(simulator.stats.collisions)
      simulator.draw(context);
    },
    controlWidth = 200;

  document.querySelector('#controls > table').innerHTML = [
    {
      label: 'particles',
      min: 0,
      max: maxParticles,
      step: 1,
      info:
        'Changes the number of particles. More particles = more fun, but it will run slower.'
    },
    {
      label: 'spacing',
      min: 2,
      max: 20,
      info: 'Changes how much space particles take up.'
    },
    {
      label: 'attraction',
      min: 0,
      max: 3,
      info: 'Changes how strongly particles attract.'
    },
    {
      label: 'repulsion',
      min: 0,
      max: 12,
      info: 'Changes how strongly particles repel when too close.'
    },
    {
      label: 'repelDist',
      min: 0,
      max: 1,
      info: 'Changes how close particles need to be to repel.'
    },
    {
      label: 'damping',
      min: 0,
      max: 1,
      info: "Changes the particles' acceleration."
    },
    {
      label: 'influence',
      min: 0,
      max: 1,
      info:
        "Changes the influence nearby particles have on a particle's velocity."
    },
    {
      label: 'friction',
      min: 0,
      max: 0.2,
      info:
        'When influence is 0, it may be necessary to use friction to slow things down.'
    },
    {
      label: 'limit',
      min: 0,
      max: 500,
      step: 1,
      info:
        'Changes the maximum number of particles each particle can interact with per frame.'
    },
    {label: 'gravity', min: 0, max: 1, info: 'Changes the gravity.'},
    {
      label: 'colors',
      min: 0,
      max: 8,
      info: 'Changes the intensity of colors.'
    },
    {
      label: 'brightness',
      min: 0,
      max: 1,
      info: 'Changes the brightness of particles.'
    },
    {
      label: 'strength',
      min: 100,
      max: 1000,
      step: 1,
      info: 'Changes the strength with which you can push particles.'
    }
  ]
    .map(
      ({label, min, max, step, info}) => `
			<tr title="${info}">
				<td>${label}</td>
				<td>
					<input
						type="range"
						style="width: ${controlWidth}px"
						value="${simulator.getParameter(label)}"
						min="${min}"
						max="${max}"
						step="${step || (max - min) / controlWidth}"
						data-label="${label}"
					/>
				</td>
				<td>${simulator.getParameter(label)}</td>
			</tr>
		`
    )
    .join('');

  $('input').on('input', function() {
    const $el = $(this);
    simulator.setParameter($el.data('label'), $el.val());
    $el
      .parent()
      .next()
      .html($el.val());
  });

  timerCanvas.width = $('#controls').width();

  //CONTROLS
  var from = false,
    mousedown = false,
    selected = false,
    shift = false,
    over = false;
  $(canvas).on('mousedown', function(e) {
    selected = simulator.attractorAtCoords(e.pageX, e.pageY);
    mousedown = 1;
  });
  $(window)
    .on('mousemove', function(e) {
      var to = {x: e.pageX, y: e.pageY};
      if (selected && mousedown) {
        if (shift) selected.mass = to.y - selected.y;
        else {
          selected.x = to.x;
          selected.y = to.y;
        }
      } else if (from && mousedown)
        simulator.dragParticles(from.x, from.y, to.x, to.y);
      else
        $('body').css(
          'cursor',
          simulator.attractorAtCoords(e.pageX, e.pageY)
            ? shift
              ? 's-resize'
              : 'move'
            : 'auto'
        );
      from = to;
    })
    .on('mouseup', function() {
      mousedown = selected = 0;
    })
    .on('dblclick', function(e) {
      if (!simulator.deleteAttractorAtCoords(e.pageX, e.pageY))
        simulator.createAttractorAtCoords(e.pageX, e.pageY, 50);
    })
    .on('keydown keyup', function(e) {
      if (e.keyCode == 16) {
        shift = e.type == 'keydown';
        $('body').css('cursor', over ? (shift ? 's-resize' : 'move') : 'auto');
      }
    })
    .on('resize', function() {
      simulator.setParameter('width', (canvas.width = $(this).width()));
      simulator.setParameter('height', (canvas.height = $(this).height()));
    })
    .trigger('resize');

  $('#reset').on('click', simulator.reset);

  loop();
})();
