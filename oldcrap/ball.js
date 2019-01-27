(function() {
    "use strict";
    var canvas = document.getElementById("C");
    var W = canvas.width = window.innerWidth;
    var H = canvas.height = window.innerHeight;
    var gravityMult = 1 / 180;
    var gravity = {
        x: 0,
        y: 0
    };
    var ball = {
        x: W / 2,
        y: H / 2,
        rad: 32,
        xs: 0,
        ys: 0,
        bounce: 0.5,
        drag: function(from, to) {
            this.x = to.x;
            this.y = to.y;
            this.xs = to.x - from.x;
            this.ys = to.y - from.y;
        },
        shake: function(movement) {
            this.x += movement.x;
            this.y += movement.y;
        },
        iterate: function() {
            this.xs += gravity.x;
            this.ys += gravity.y;
            this.x += this.xs;
            this.y += this.ys;

            if (this.x < this.rad) {
                this.x = this.rad;
                this.xs *= -this.bounce;
            } else if (this.x > W - this.rad) {
                this.x = W - this.rad;
                this.xs *= -this.bounce;
            }
            if (this.y < this.rad) {
                this.y = this.rad;
                this.ys *= -this.bounce;
            } else if (this.y > H - this.rad) {
                this.y = H - this.rad;
                this.ys *= -this.bounce;
            }
        }
    };

    var touches = {};
    var handlers = {
        resize: function() {
            canvas.width = W;
            canvas.height = H;
        },
        deviceorientation: function(e) {
            e.preventDefault();

            gravity.x = e.gamma * gravityMult;
            gravity.y = e.beta * gravityMult;
        },
        touchstart: function(e) {
            e.preventDefault();
            for (var i = 0; i < e.changedTouches.length; i++) {
                var touch = e.changedTouches[i];
                touches[touch.identifier] = {
                    x: touch.pageX,
                    y: touch.pageY
                };
            }
        },
        touchmove: function(e) {
            e.preventDefault();
            for (var i = 0; i < e.changedTouches.length; i++) {
                var touch = e.changedTouches[i];
                var coords = {
                    x: touch.pageX,
                    y: touch.pageY
                };
                ball.drag(touches[touch.identifier], coords);
                touches[touch.identifier] = coords;
            }
        },
        devicemotion: function(e) {
            ball.shake(e.acceleration);
        }
    };

    function draw() {
        var T = canvas.getContext('2d');
        T.clearRect(0, 0, W, H);
        T.fillStyle = 'blue';
        T.beginPath();
        T.arc(ball.x, ball.y, ball.rad, 0, 2 * Math.PI);
        T.fill();
    }

    function loop() {
        requestAnimationFrame(loop);
        ball.iterate();
        draw();
    }

    Object.keys(handlers).forEach(function(eventName){
        window.addEventListener(eventName, handlers[eventName]);
    });
    handlers.resize();
    loop();
})();