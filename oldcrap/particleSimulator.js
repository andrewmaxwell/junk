/*
ParticleSimulator
Written by Andrew Maxwell
*/

function ParticleSimulator(width, height, maxParticles){
	var params={
		width: width,
		height: height,
		spacing: 8,
		particles: 10000,
		influence: 0.25,
		repelDist: 0.5,
		repulsion: 3,
		attraction: 0.05,
		friction: 0,
		damping: 0.5,
		limit: 200,
		gravity: 0,
		colors: 1,
		brightness: 0.5,
		strength: 300,
		wallBounciness: 1,
		attractorSize: 100,
		attractorGravity: 0.3
	},
	xCoord=new Float32Array(maxParticles),
	yCoord=new Float32Array(maxParticles),
	prevX=new Uint16Array(maxParticles),
	prevY=new Uint16Array(maxParticles),
	xVel=new Float32Array(maxParticles),
	yVel=new Float32Array(maxParticles),
	bucketIndex=new Uint16Array(maxParticles),
	
	colorCanvas=document.createElement("canvas"),
	colorCanvasContext=colorCanvas.getContext('2d'),
	rows, cols, bg,
	buckets, bucketSizes,
	attractors=[],
	
	// stats={
		// checked: 0,
		// collisions: 0
	// },
	
	reset=function(){
		buildBuckets()
		for (var i=0; i<maxParticles; i++){
			xVel[i]=0
			yVel[i]=0
			xCoord[i]=prevX[i]=params.width*Math.random()
			yCoord[i]=prevY[i]=params.height*Math.random()
		}
	},
	
	doCollisions=function(i){
		if (params.influence || params.attraction || params.repulsion){
			for (var k=0, o, dx, dy, distanceSquared, distance, acc, flowPower,accX, accY; k<bucketSizes[bucketIndex[i]]; k++){
				o=buckets[params.limit*bucketIndex[i]+k]
				if (i<o){
					dx=xCoord[i]-xCoord[o]
					dy=yCoord[i]-yCoord[o]
					distanceSquared=dx*dx+dy*dy
					if (distanceSquared<params.spacing*params.spacing){
						distance=Math.sqrt(distanceSquared)/params.spacing
						acc=(1-distance)*params.attraction
						flowPower=params.influence*(1-distance)
						if (distance<params.repelDist) acc-=params.repulsion*(1-distance/params.repelDist)
						
						accX=flowPower*(xVel[o]-xVel[i])-dx*acc
						accY=flowPower*(yVel[o]-yVel[i])-dy*acc
						
						xVel[i]+=accX
						yVel[i]+=accY
						xVel[o]-=accX
						yVel[o]-=accY
						
						// stats.collisions++
					}
					// stats.checked++
				}
			}
		}
	},
	
	iterateAttractors=function(i){
		for (var k=0,dx,dy,distanceSquared,acc; k<attractors.length; k++){
			dx=attractors[k].x-xCoord[i]
			dy=attractors[k].y-yCoord[i]
			distanceSquared=dx*dx+dy*dy
			if (distanceSquared<1){
				xCoord[i]=prevX[i]=params.width*Math.random()
				yCoord[i]=prevY[i]=params.height*Math.random()
				xVel[i]=0
				yVel[i]=0
			} else {
				acc=attractors[k].mass*params.attractorGravity/distanceSquared
				xVel[i]+=dx*acc
				yVel[i]+=dy*acc
			}
		}
	},
	
	emptyBuckets=function(){
		for (var i=0; i<bucketSizes.length; i++) bucketSizes[i]=0
	}, 
	
	wallCollide=function(i){
		if (xCoord[i]<0){
			xCoord[i]=0
			xVel[i]*=-params.wallBounciness
		} else if (xCoord[i]>params.width-1){
			xCoord[i]=params.width-1
			xVel[i]*=-params.wallBounciness
		}
		if (yCoord[i]<0){
			yCoord[i]=0
			yVel[i]*=-params.wallBounciness
		} else if (yCoord[i]>params.height-1){
			yCoord[i]=params.height-1
			yVel[i]*=-params.wallBounciness
		}
	},
	
	addToBuckets=function(i){
		var row=Math.floor(yCoord[i]/params.spacing),
			col=Math.floor(xCoord[i]/params.spacing),
			r,c,b;
		bucketIndex[i]=row*cols+col
		for(r=Math.max(row-1,0); r<=Math.min(row+1, rows-1); r++){
			for(c=Math.max(col-1, 0); c<=Math.min(col+1, cols-1); c++){
				b=r*cols+c
				if (bucketSizes[b]<params.limit) buckets[b*params.limit+bucketSizes[b]]=i
				bucketSizes[b]++
			}
		}
	}, 
	
	iterate=function(i){
		xCoord[i]+=xVel[i]*params.damping
		yCoord[i]+=yVel[i]*params.damping
		xVel[i]*=1-params.friction
		yVel[i]*=1-params.friction
		yVel[i]+=params.gravity
	}, 
	
	drawColors=function(context){
		if (params.colors){
			for (var i=0; i<bucketSizes.length; i++){
				bg.data[4*i+1]=(bucketSizes[i]-8)*params.colors
				bg.data[4*i+2]=bucketSizes[i]*2*params.colors
			}
			colorCanvasContext.putImageData(bg,0,0)
			context.drawImage(colorCanvas,0,0,params.width,params.height)
		} else context.clearRect(0,0,params.width,params.height)
	},
	
	drawAttractors=function(context){
		for (var i=0,a,rad,grad; i<attractors.length; i++){
			a=attractors[i],
			rad=Math.abs(a.mass),
			grad=context.createRadialGradient(a.x, a.y, 0, a.x, a.y, rad)
			if (a.mass<0){
				grad.addColorStop(0, "#FFF")
				grad.addColorStop(0.1, "rgba(255,255,255,0.5)")
				grad.addColorStop(0.1, "rgba(255,255,255,0.3)")
				grad.addColorStop(1, "rgba(255,255,255,0)")
			} else {
				grad.addColorStop(0, "black")
				grad.addColorStop(0.05, "rgba(43,0,33,1)")
				grad.addColorStop(1, "rgba(43,0,33,0)")
			}
			context.fillStyle=grad
			context.fillRect(a.x-rad, a.y-rad, 2*rad, 2*rad)
		}
	},
	
	drawParticles=function(context){
		if (params.brightness){
			context.strokeStyle="white"
			context.lineWidth=params.brightness
			context.beginPath()
			for (var i=0; i<params.particles; i++){
				context.moveTo(prevX[i], prevY[i])
				context.lineTo(prevX[i]=xCoord[i], prevY[i]=yCoord[i])
			}
			context.stroke()
		}
	},
	
	// resetStats=function(){
		// stats.checked=0
		// stats.collisions=0
	// },
	
	buildBuckets=function(){
		rows=Math.ceil(params.height/params.spacing)
		cols=Math.ceil(params.width/params.spacing)
		bg=colorCanvasContext.createImageData(cols, rows)
		
		colorCanvas.width=cols
		colorCanvas.height=rows
		
		bucketSizes=new Uint16Array(rows*cols)
		buckets=new Uint16Array(rows*cols*params.limit)
		
		for (var i=0; i<bucketSizes.length; i++) bg.data[4*i+3]=255
	}
	
	reset()
	
	return {
		// stats: stats,
		reset: reset,
		tick: function(){
			// resetStats()
			emptyBuckets()
			for (var i=0; i<params.particles; i++){
				iterate(i)
				wallCollide(i)
				addToBuckets(i)
			}
			for (i=0; i<params.particles; i++){
				doCollisions(i)
				iterateAttractors(i)
			}
		},
		draw: function(context){
			drawColors(context)
			drawAttractors(context)
			drawParticles(context)
		},
		deleteAttractorAtCoords: function(x,y){
			for (var i=attractors.length,a,dx,dy; i--;){
				a=attractors[i]
				dx=x-a.x
				dy=y-a.y
				if (dx*dx+dy*dy<params.attractorSize){
					attractors.splice(i--, 1)
					return true
				}
			}
			return false
		},
		createAttractorAtCoords: function(x,y,mass){
			attractors.push({
				x: x,
				y: y,
				mass: mass
			})
		},
		attractorAtCoords: function(x,y){
			for (var i=0,a,dx,dy; i<attractors.length; i++){
				a=attractors[i]
				dx=x-a.x
				dy=y-a.y
				if (dx*dx+dy*dy<params.attractorSize) return a
			}
			return false
		},
		dragParticles: function(fromX, fromY, toX, toY){
			for (var i=0,dx,dy,d; i<params.particles; i++){
				dx=fromX-xCoord[i]
				dy=fromY-yCoord[i]
				d=params.strength/Math.max(1000, dx*dx+dy*dy)
				xVel[i]+=(toX-fromX)*d
				yVel[i]+=(toY-fromY)*d
			}
		},
		getParameter: function(key){
			return params[key]
		},
		setParameter: function(key, value){
			params[key]=value
			if (["width", "height", "spacing", "limit"].indexOf(key)>=0) buildBuckets()
		}
	}
}