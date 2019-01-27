/*

StatCanvas 
Written by Andrew Maxwell
Purpose: To draw a histogram on a canvas. Especially useful for frame rates.

SUGGESTED USE

var timerCanvas=document.getElementById("timerCanvas"),
	frameRateTimer=StatCanvas({
		canvas: timerCanvas,
		color: "rgba(255,255,255,0.5)",
		displayAverage: function(avg){
			return Math.round(1000/avg)+" fps"
		}
	}),
	requestAnimFrame = (window.requestAnimationFrame || window.mozRequestAnimationFrame || window.webkitRequestAnimationFrame || window.msRequestAnimationFrame),
	prevTime=new Date(),
	loop=function(){
		requestAnimFrame(loop, canvas)
		
		//calculate and draw stuff
	
		var time=new Date()
		if (time-prevTime<1000) frameRateTimer.tick(time-prevTime)
		prevTime=time
	}


*/

function StatCanvas(params){
	var T=params.canvas.getContext('2d'),
		prevTime=new Date(),
		x=0,
		total=0,
		numVals=100,
		vals=new Float32Array(numVals),
		ticks=0
	if (!params.multiplier) params.multiplier=1
	if (!params.displayAverage) params.displayAverage=Math.round
	T.translate(-0.5, 0)
		
	return {
		tick: function(value){
			x=(x+1)%params.canvas.width
			T.clearRect(x, 0, 1, params.canvas.height)
			T.strokeStyle=params.color
			T.beginPath()
			T.moveTo(x, params.canvas.height)
			T.lineTo(x, params.canvas.height-value*params.multiplier)
			T.stroke()
			
			total+=value-vals[ticks%numVals]
			vals[ticks%numVals]=value
			ticks++
			
			if (ticks>numVals){
				var txt=params.displayAverage(total/numVals)
				T.fillStyle="black"
				T.fillRect(0, params.canvas.height-10, T.measureText(txt).width+3, 10)
				T.fillStyle="white"
				T.fillText(txt, 0, params.canvas.height)
			}
		}
	}
}