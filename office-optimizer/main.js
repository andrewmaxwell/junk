'use strict';

const angular = require('//ajax.googleapis.com/ajax/libs/angularjs/1.6.4/angular.min.js');
const optimizer = require('optimizer.js');
const Grapher = require('grapher.js');

angular.module('app', []).component('optimizer', {
  template: `
    <p>Use letters or numbers for occupied seats, underscores for unoccupied seats, periods for walking space, and any other non-whitespace characters for walls. People in the same group should have the same letter (case-sensitive) or number. Make sure all seats are accessible to all other seats.</p>

    <p>Examples:
      <span ng-repeat="p in $ctrl.presets">
        <a href="javascript:void 0" ng-click="$ctrl.selectPreset(p)">{{ p.name }}</a>
      </span>
    </p>
    
    <textarea ng-model="$ctrl.input" ng-change="$ctrl.analyzeRoom()"></textarea>
    <p ng-show="$ctrl.issue" style="color: red">{{ $ctrl.issue }}</p>

    <div>
      <input type="number" ng-model="$ctrl.iterations"> iterations
    </div>

    <div>
      <input type="number" ng-model="$ctrl.moveCost"> cost to move
    </div>

    <button ng-click="$ctrl.calculate()">Calculate Seating Assignments</button>

    <div ng-show="$ctrl.output" style="margin-top: 30px">
      <p>
        Original Score: {{ $ctrl.origCost }}
        <br>
        Optimized Score: {{ $ctrl.bestCost }}
        <br>
        {{ (1 - $ctrl.bestCost / $ctrl.origCost) * 100 | number:0 }}% improvement
      </p>
      <textarea ng-model="$ctrl.output"></textarea>
      <canvas id="C"></canvas>
    </div>
  `,
  controller() {
    var graph = new Grapher({
      canvas: document.getElementById('C'),
      width: 600,
      height: 100
    });

    this.presets = [
      {
        name: 'Small',
        layout: `
        cabac
        b...b
        c...c
        bacab`
      },
      {
        name: 'Medium',
        layout: `
        aka|aka|aka|fkf|fkf|gkg
        a.d|e.d|b.b|f.f|f.f|g.g
        c.cme.cmc.cmg.gmg.gmg.g
        .......................
        ||||||||||...||||||||||
        .......................
        d.dmd.dmd.dmh.hmh.hmh.h
        e.e|e.e|e.e|i.i|i.i|i.j
        eke|eke|eke|jkj|jkj|jkj`
      },
      {
        name: 'Large',
        layout: `
        aaaaaaabbbbbbbccccccceeeeee
        f....ff....gg....gg....hh.h
        h.hi.ii.ii.ii.jj.jj.jj.jk.k
        k.kk.kl.ll.ll.ll.mm.mm.mm.m
        n.ff....ff....gg....gh....n
        n.nnooooooopppppppehhknrrrr
        r.rssssssstttttttuuuuuuuvvv
        v.AA....AA....AA....BB....u
        u.ww.ww.ww.wv.vv.vv.vv.xx.x
        x.xx.xy.yy.yy.yy.zz.zz.zz.z
        A....vv....vu....uu....uu.B
        BBBBCCCCCCCDDDDDDDEEEEEEEnr`
      }
    ];
    this.iterations = 1e5;
    this.moveCost = 0;

    this.selectPreset = preset => {
      this.input = preset.layout.trim().replace(/ /g, '');
      this.analyzeRoom();
    };

    this.analyzeRoom = () => {
      // this.issue = optimizer.checkRoom(this.input);
      this.output = '';
    };

    this.calculate = () => {
      // console.profile('calculate');
      this.issue = optimizer.checkRoom(this.input);
      if (!this.issue) {
        var {output, bestCost, origCost, costs} = optimizer.calculate(
          this.input,
          this.iterations,
          this.moveCost
        );
        // console.profileEnd('calculate');
        this.output = output;
        this.bestCost = bestCost;
        this.origCost = origCost;
        graph.render([{data: costs, color: 'black'}]);
      }
    };

    this.selectPreset(this.presets[0]);
    this.calculate();
  }
});
