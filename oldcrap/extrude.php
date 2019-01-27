<?php
if (isset($_GET["u"])){
	$u=$_GET["u"];
	if (!preg_match("/^http:\/\//", $u)) $u="http://".$u;
	foreach(get_headers($u) as $header) if (preg_match("/^Content-Type/", $header)) header($header);
	die(file_get_contents($u));
}
ob_start("ob_gzhandler");
?><!doctype html>
<meta http-equiv="X-UA-Compatible" content="chrome=1" >
<title>Image Extruder</title>
<style type="text/css">
.ui-slider{float:left;width:300px;height:4px;position:relative;top:5px;border-radius:3px;background:#CCC;border:1px inset}
.ui-slider a{position:absolute;left:-4px;top:-5px;z-index:2;width:8px;height:14px;background:#EEE;border-radius:2px;box-shadow:0 1px 3px rgba(0,0,0,.4)}
.ui-slider-range{background:#6AF;top:0;height:100%;position:absolute;z-index:1}
label {float: left; width: 100px}
#url {width: 300px; background: rgba(255,255,255,.25); border: 0; color: white}
</style>
<body style="font-family:monospace;color:white;position:relative;background:black;margin:0;overflow:hidden"><canvas id="c">Internet Explorer? That's cute. <a href="http://www.google.com/chrome">Get a serious browser.</a></canvas>
<div style="position:absolute;background:rgba(30,30,30,.5);padding:10px;border-radius:10px;display:none" id="s"><div style="clear:both"><label for="url">image url</label><input id="url"/></div>
</div><script src="jquery.js"></script><script src="jquery-ui.js"></script><script>
var _3d=(function(){
	var camLoc, viewLoc, rotMatrix, 
	matrixMult=function(a,b){
		for (var res=[], c, k, r=0; r<a.length; r++){
			for (res[r]=[], c=0; c<b[0].length; c++){
				for (res[r][c]=k=0; k<a[0].length; k++) res[r][c]+=a[r][k]*b[k][c]
			}
		}
		return res;
	}
	return {
		set: function(cameraLocation, camRot, viewLocation){
			var matx=[[1, 0, 0], [0, Math.cos(camRot[0]), -Math.sin(camRot[0])], [0, Math.sin(camRot[0]), Math.cos(camRot[0])]],
				maty=[[Math.cos(camRot[1]), 0, Math.sin(camRot[1])], [0, 1, 0], [-Math.sin(camRot[1]), 0, Math.cos(camRot[1])]],
				matz=[[Math.cos(camRot[2]), -Math.sin(camRot[2]), 0], [Math.sin(camRot[2]), Math.cos(camRot[2]), 0], [0, 0, 1]];
			rotMatrix=matrixMult(matrixMult(matx, maty), matz);
			camLoc=cameraLocation
			viewLoc=viewLocation
		},
		map: function(pt){
			var d = matrixMult(rotMatrix, [[pt[0] - camLoc[0]], [pt[1] - camLoc[1]], [pt[2] - camLoc[2]]]), m=viewLoc[2]/d[2][0];
			return {x: m*(d[0][0]-viewLoc[0]), y: m*(d[1][0]-viewLoc[1]), z: d[2][0]};
		}
	}
}()),
angX=Math.PI/2, zoom=300, dist=zoom/2, extrusion=40, cameraHeight=0, frames=totalTime=0, A=[], C=document.body.childNodes[0], W=C.width=innerWidth, H=C.height=innerHeight, T=C.getContext('2d');
T.translate(W/2, H/2)
C.onmousemove=function(e){
	dist=zoom*(.7-e.clientY/H)
	angX=(1-e.clientX/W)*2*Math.PI
	draw()
}
C.onclick=function(e){
	$("#s").fadeIn().css({top: e.clientY-10, left: Math.min(innerWidth-$("#s").outerWidth(), e.clientX-10)})
}
$("#s").mouseleave(function(){
	$(this).fadeOut()
})
$("#url").change(function(){
	location.hash=$(this).val()
})
$(window).bind("hashchange", function(){
	var img=new Image(), maxSize=300;
	img.src=location.hash? "?u="+location.hash.substring(1): "circlepuzzle.jpg";
	img.onload=function(){
		var w=img.width, h=img.height,
			ic=document.createElement("canvas"), 
			it=ic.getContext('2d'),
			sc=maxSize/Math.max(w, h),
			sw=ic.width=Math.floor(w*sc),
			sh=ic.height=Math.floor(h*sc)
		
		it.drawImage(img, 0, 0, w, h, 0, 0, sw, sh)
		var px=it.getImageData(0,0,sw,sh), d=px.data
		A=[]
		for (var i=0; i<d.length; i+=4){
			var b=(d[i]+d[i+1]+d[i+2])/768;
			if (b>.1){
				var k={
					x: px.width/2-(i>>2)%px.width,
					y: .5-b,
					z: px.height/2-Math.floor(i/4/px.width),
					c: "rgb("+d[i]+','+d[i+1]+','+d[i+2]+')'
				}
				A.push(k)
			}
		}
		draw()
	}
	$("#url").val(location.hash.substring(1))
}).trigger("hashchange")
function draw(){
	if (A.length){
		var start=new Date(), p=[];
		_3d.set(
			[dist*Math.cos(angX), dist*Math.sin(angX), cameraHeight], //camera location
			[Math.PI/2, 0, 3*Math.PI/2-angX], //camera rotation
			[0, 0, zoom] //view location
		)
		for (var i=0; i<A.length; i++){
			var a=A[i], k=_3d.map([a.x, a.y*extrusion, a.z]);
			if (k.z>0 && Math.abs(k.x*2)<W && Math.abs(k.y*2)<H){
				k.c=a.c
				p.push(k)
			}
		}
		p.sort(function(a,b){return b.z-a.z})
		T.clearRect(-W/2,-H/2,W,H)
		for (var i=0; i<p.length; i++){
			var m=p[i]
			if (m.z>0){
				var s=zoom/m.z
				T.fillStyle=p[i].c;
				T.fillRect(m.x-s/2, m.y-s/2, s, s)
			}
		}
		frames++;
		totalTime+=(new Date()-start)
		T.fillStyle="white"
		T.fillText(totalTime/frames>>0, 2-W/2,14-H/2)
	}
}
for(e in k={
zoom:{slide:function(b,a){zoom=a.value;draw()},value:zoom,min:10,max:1000},
extrusion:{slide:function(b,a){extrusion=a.value;draw()},value:extrusion,min:-100,max:100},
position:{slide:function(b,a){cameraHeight=a.value;draw()},value:cameraHeight,min:-100,max:100},
})$("<div>").appendTo("#s").css({clear:"both"}).append($("<label>").html(e)).append($("<div>").slider(k[e]));
</script></body><?php ob_end_flush()?>