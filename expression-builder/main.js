import {initialValue} from './initialValue.js';
const {angular} = window;

var app = angular.module('app', []);

var indent = str => str && str.replace && str.replace(/\n/g, '\n  ');
var trimQuotes = str => str && str.replace && str.replace(/^'|'$/g, '');

const expressionTypes = [
  {
    label: 'id',
    op: 'id',
    literal: true,
    render: expr => expr.schema + '.' + expr.column,
    type: 'any'
  },
  {
    label: 'text',
    op: 'text',
    literal: true,
    render: expr => "'" + (expr.value || '') + "'",
    type: 'text'
  },
  {
    label: 'num',
    op: 'num',
    literal: true,
    render: expr => expr.value,
    type: 'number'
  },
  {
    label: 'list',
    op: 'list',
    minArgs: 1,
    maxArgs: Infinity,
    render: expr => '(' + expr.args.map(render).join(',') + ')',
    type: 'list',
    argTypes: 'notBoolean'
  },
  {
    label: 'and',
    op: 'AND',
    minArgs: 2,
    maxArgs: Infinity,
    render: expr =>
      indent('(\n' + expr.args.map(render).join('\nAND ')) + '\n)',
    infix: true,
    type: 'boolean',
    argTypes: 'boolean',
    format: true
  },
  {
    label: 'or',
    op: 'OR',
    minArgs: 2,
    maxArgs: Infinity,
    render: expr => indent('(\n' + expr.args.map(render).join('\nOR ')) + '\n)',
    infix: true,
    type: 'boolean',
    argTypes: 'boolean',
    format: true
  },
  {
    label: 'not',
    op: 'NOT',
    minArgs: 1,
    maxArgs: 1,
    render: expr => 'NOT ' + indent('(\n' + render(expr.args[0])) + '\n)',
    type: 'boolean',
    argTypes: 'boolean'
  },
  ...['IN', 'NOT IN', '=', '!=', '<', '>', '<=', '>='].map(op => ({
    label: op.toLowerCase(),
    op,
    minArgs: 2,
    maxArgs: 2,
    render: expr => expr.args.map(render).join(' ' + op + ' '),
    infix: true,
    type: 'boolean',
    argTypes: 'notBoolean'
  })),
  {
    label: 'contains',
    op: 'Contains',
    minArgs: 2,
    maxArgs: 2,
    render: expr =>
      `${render(expr.args[0])} LIKE '%${trimQuotes(render(expr.args[1]))}%'`,
    type: 'boolean',
    argTypes: ['notBoolean', 'text'],
    infix: true
  },
  {
    label: "doesn't contain",
    op: "Doesn't Contain",
    minArgs: 2,
    maxArgs: 2,
    render: expr =>
      `${render(expr.args[0])} NOT LIKE '%${trimQuotes(
        render(expr.args[1])
      )}%'`,
    type: 'boolean',
    argTypes: ['notBoolean', 'text'],
    infix: true
  },
  {
    label: 'begins With',
    op: 'Begins With',
    minArgs: 2,
    maxArgs: 2,
    render: expr =>
      `${render(expr.args[0])} LIKE '${trimQuotes(render(expr.args[1]))}%'`,
    type: 'boolean',
    argTypes: ['notBoolean', 'text'],
    infix: true
  },
  {
    label: "doesn't begin with",
    op: "Doesn't Begin With",
    minArgs: 2,
    maxArgs: 2,
    render: expr =>
      `${render(expr.args[0])} NOT LIKE '${trimQuotes(render(expr.args[1]))}%'`,
    type: 'boolean',
    argTypes: ['notBoolean', 'text'],
    infix: true
  },
  {
    label: 'ends with',
    op: 'Ends With',
    minArgs: 2,
    maxArgs: 2,
    render: expr =>
      `${render(expr.args[0])} LIKE '%${trimQuotes(render(expr.args[1]))}'`,
    type: 'boolean',
    argTypes: ['notBoolean', 'text'],
    infix: true
  },
  {
    label: "doesn't end with",
    op: "Doesn't End With",
    minArgs: 2,
    maxArgs: 2,
    render: expr =>
      `${render(expr.args[0])} NOT LIKE '%${trimQuotes(render(expr.args[1]))}'`,
    type: 'boolean',
    argTypes: ['notBoolean', 'text'],
    infix: true
  },
  ...['+', '-', '*', '/'].map(op => ({
    label: op,
    op,
    minArgs: 2,
    maxArgs: Infinity,
    render: expr => expr.args.map(render).join(' ' + op + ' '),
    infix: true,
    type: 'number',
    argTypes: 'number'
  })),
  {
    label: 'concat',
    op: '||',
    minArgs: 2,
    maxArgs: Infinity,
    render: expr => expr.args.map(render).join(' || '),
    type: 'text',
    argTypes: 'text',
    infix: true
  },
  {
    label: 'uppercase',
    op: 'Uppercase',
    minArgs: 1,
    maxArgs: 1,
    render: expr => 'UPPER(' + expr.args.map(render).join(', ') + ')',
    type: 'text',
    argTypes: 'text'
  },
  {
    label: 'date to num',
    op: 'TRUNC',
    minArgs: 1,
    maxArgs: 1,
    render: expr => 'TRUNC(' + expr.args.map(render).join(', ') + ')',
    type: 'number',
    argTypes: 'notBoolean'
  },
  {
    label: 'if null then',
    op: 'NVL',
    minArgs: 2,
    maxArgs: 2,
    render: expr => 'NVL(' + expr.args.map(render).join(', ') + ')',
    infix: true,
    type: 'any',
    argTypes: 'notBoolean'
  }
];

expressionTypes.forEach(e => {
  expressionTypes[e.op] = e;
});

var render = (expressionTypes.render = expr => {
  var info = expressionTypes[expr.op];
  return expr.op && info ? info.render(expr) : '';
});

const schemas = {
  TRANS_DETAIL: [
    'PROGRAM_ID',
    'ACCOUNT_ID',
    'AGGREGATE_MERCHANT_ID',
    'MERCH_SHORT_DBA_NAME',
    'MERCHANT_CATEGORY_CODE',
    'CARDHOLDER_PRESENT_CD',
    'CLASSIFICATION_CODE',
    'TRANSACTION_DATE',
    'TRANSACTION_TYPE'
  ],
  CUSTOMER_ACCOUNT: [
    'ACCOUNT_ID',
    'CUSTOMER_ID',
    'ACTIVE_DATE',
    'USER_DEFINED2'
  ],
  CUSTOMER: ['CUSTOMER_ID', 'EMP_SW']
};

const childExpr = arg => `
  <mc-expression
    expr="${arg}"
    parent-expr="$ctrl.expr"
    on-remove="$ctrl.removeArg(${arg})"
    on-add-parent="$ctrl.insertIntermediate(${arg})"
    on-move="$ctrl.moveChild(${arg}, value)"
    can-move="$ctrl.canMoveChild(${arg}, value)"
  ></mc-expression>
`;

app.component('mcExpression', {
  template: `
    <span class="sqlExpr" ng-class="{exprGroup: $ctrl.types[$ctrl.expr.op].format}">
      <span ng-if="$ctrl.types[$ctrl.expr.op].format">(<br/></span>

      <span ng-class="{indentExpr: $ctrl.types[$ctrl.expr.op].format}">

        <span ng-if="$ctrl.types[$ctrl.expr.op].infix">
          ${childExpr('$ctrl.expr.args[0]')}
        </span>

        <br ng-if="$ctrl.types[$ctrl.expr.op].format"/>

        <mc-btn-dropdown options="$ctrl.actions"></mc-btn-dropdown>

        <input
          type="{{ $ctrl.types[$ctrl.expr.op].type }}"
          class="form-control"
          ng-model="$ctrl.expr.value"
          ng-if="$ctrl.expr.op === 'num' || $ctrl.expr.op === 'text'"
        >

        <select
          ng-show="$ctrl.expr.op === 'id'"
          ng-model="$ctrl.expr.schema"
          ng-options="key as key for (key, value) in $ctrl.schemas"
          class="form-control"
        ></select>
        <select
          ng-show="$ctrl.expr.op === 'id'"
          ng-model="$ctrl.expr.column"
          ng-options="s for s in $ctrl.schemas[$ctrl.expr.schema]"
          class="form-control"
        ></select>

        <span ng-repeat="arg in $ctrl.expr.args.slice($ctrl.types[$ctrl.expr.op].infix ? 1 : 0)">
          <strong ng-if="$ctrl.types[$ctrl.expr.op].infix && $index > 0">
            <br ng-if="$ctrl.types[$ctrl.expr.op].format"/>
            {{ $ctrl.types[$ctrl.expr.op].label }}
          </strong>
          ${childExpr('arg')}
        </span>

        <mc-button
          ng-show="!$ctrl.expr.literal && $ctrl.expr.args.length < $ctrl.types[$ctrl.expr.op].maxArgs"
          options="{icon: 'plus', label: ' ' + $ctrl.types[$ctrl.expr.op].label, buttonClass: 'btn-sm btn-default', style: 'padding: 4px'}"
          ng-click="$ctrl.addArg()"
        ></mc-button>
      </span>

      <span ng-if="$ctrl.types[$ctrl.expr.op].format">)</span>
    </span>
  `,
  bindings: {
    expr: '=',
    parentExpr: '<',
    onRemove: '&',
    onAddParent: '&',
    onReplace: '&',
    canMove: '&',
    onMove: '&'
  },
  controller() {
    this.types = expressionTypes;
    this.schemas = schemas;

    var selectType = type => {
      var args = this.expr.args;
      this.expr.op = type.op;

      if (type.literal) {
        args.length = 0;
      } else {
        args.length = Math.min(args.length, type.maxArgs);
        while (args.length < type.minArgs) {
          this.addArg();
        }
      }
    };

    this.addArg = () => {
      var args = this.expr.args;
      var lastOp = args.length && args[args.length - 1].op;
      args.push({
        args: [],
        op: lastOp && expressionTypes[lastOp].literal && lastOp
      });
    };
    this.removeArg = arg => {
      var argIndex = this.expr.args.indexOf(arg);
      console.log('removeArg', argIndex);
      if (arg.args[0]) {
        this.expr.args[argIndex] = arg.args[0];
      } else {
        this.expr.args.splice(argIndex, 1);
      }
    };
    this.insertIntermediate = arg => {
      this.expr.args[this.expr.args.indexOf(arg)] = {args: [arg]};
    };
    this.canMoveChild = (arg, dir) => {
      var idx = this.expr.args.indexOf(arg) + dir;
      return idx >= 0 && idx < this.expr.args.length;
    };
    this.moveChild = (arg, dir) => {
      var argIndex = this.expr.args.indexOf(arg);
      var idx = argIndex + dir;
      this.expr.args[argIndex] = this.expr.args[idx];
      this.expr.args[idx] = arg;
    };

    this.actions = {
      label: () =>
        this.expr.op ? expressionTypes[this.expr.op].label : 'Operator/Type',
      buttonClass: 'btn-link',
      buttonStyle: 'padding: 0; margin: 0; font-weight: bold',
      hideCaret: true,
      items: [
        ...expressionTypes.map(type => ({
          label: type.label,
          onClick: () => selectType(type),
          disabled: () => this.expr.op === type.op,
          show: () => {
            if (type.type === 'any') return true;
            var argTypes =
              this.parentExpr &&
              this.parentExpr.op &&
              this.types[this.parentExpr.op].argTypes;
            var argType = Array.isArray(argTypes)
              ? argTypes[this.parentExpr.args.indexOf(this.expr)]
              : argTypes;
            return (
              !argType ||
              argType === type.type ||
              (argType === 'notBoolean' && type.type !== 'boolean')
            );
          }
        })),
        {
          label: 'Swap with Previous Argument',
          show: () => this.canMove && this.canMove({value: -1}),
          onClick: () => this.onMove({value: -1}),
          icon: 'chevron-left'
        },
        {
          label: 'Swap with Next Argument',
          show: () => this.canMove && this.canMove({value: 1}),
          onClick: () => this.onMove({value: 1}),
          icon: 'chevron-right'
        },
        {
          label: 'Increase Nesting Level',
          show: () => this.onAddParent && this.expr && this.expr.op,
          onClick: () => this.onAddParent(),
          icon: 'plus'
        },
        {
          label: 'Remove',
          show: () =>
            this.expr.args.length ||
            (this.parentExpr &&
              this.parentExpr.op &&
              this.parentExpr.args.length >
                this.types[this.parentExpr.op].minArgs),
          onClick: () => this.onRemove(),
          icon: 'trash'
        }
      ]
    };
  }
});

app.component('sqlEditor', {
  template: `
    <mc-button options="{icon: 'plus', label: 'Populate'}" ng-click="$ctrl.populate()"></mc-button>
    <mc-button options="{icon: 'trash', label: 'Clear'}" ng-click="$ctrl.clear()"></mc-button>

    <h3>Filter Definition</h3>
    <p>Instructions: Identify the main operator on the WHERE clause and recurse on each argument or sub exression.</p>
    <p>Example: in <code>SOME_COLUMN = 432 AND ANOTHER_COLUMN = 'Some Value'</code>, the primary operator is <code>AND</code>. The main operator of <code>SOME_COLUMN = 432</code> is <code>=</code>.</p>

    <div class="exprGroup" style="margin: 50px 0">
      <mc-expression
        expr="$ctrl.expr"
        on-add-parent="$ctrl.addParent()"
        on-remove="$ctrl.replace()"
      ></mc-expression>
    </div>

    <div ng-show="$ctrl.render().length">
      <h3>SQL:</h3>
      <pre style="margin-top: 20px">{{ $ctrl.render() }}</pre>
    </div>
  `,
  controller() {
    this.expr = localStorage.expr ? JSON.parse(localStorage.expr) : {args: []};

    this.addParent = () => {
      this.expr = {args: [this.expr]};
    };
    this.replace = () => {
      this.expr = this.expr.args[0];
    };

    this.render = () => {
      localStorage.expr = angular.toJson(this.expr);
      return expressionTypes.render(this.expr);
    };

    this.clear = () => {
      this.expr = {args: []};
    };
    this.populate = () => {
      this.expr = initialValue;
    };
  }
});

app.component('mcButton', {
  template: `
    <button
      class="btn {{ $ctrl.options.buttonClass || 'btn-default' }}"
      style="{{ $ctrl.options.style }}"
    >
      <span ng-if="$ctrl.options.icon" class="glyphicon glyphicon-{{ $ctrl.options.icon }}"></span>
      {{ $ctrl.options.label }}
    </button>
  `,
  bindings: {options: '<'}
});

app.component('mcBtnDropdown', {
  template: `
    <div class="btn-group" ng-show="$ctrl.show()">
      <button type="button"
        class="btn dropdown-toggle {{ $ctrl.options.buttonClass }}"
        style="{{ $ctrl.options.buttonStyle }}"
        ng-click="$ctrl.openDropdown()"
      ><span ng-if="$ctrl.options.icon" class="glyphicon glyphicon-{{ $ctrl.options.icon() }}"></span>{{ $ctrl.options.label() }}
        <span class="caret" ng-hide="$ctrl.options.hideCaret"></span>
      </button>
      <ul class="dropdown-menu" style="display: block" ng-show="$ctrl.isOpen">
        <li ng-repeat="item in $ctrl.options.items" ng-show="!item.show || item.show()" ng-class="{disabled: item.disabled()}">
          <a ng-click="item.onClick()">
            <span ng-if="item.icon" class="glyphicon glyphicon-{{ item.icon }}"></span>
            {{ item.label }}
          </a>
        </li>
      </ul>
    </div>
  `,
  bindings: {
    options: '<'
  },
  replace: true,
  controller: [
    '$document',
    '$scope',
    '$timeout',
    function($document, $scope, $timeout) {
      this.isOpen = false;
      this.show = () =>
        this.options &&
        this.options.items.find(item => !item.show || item.show());

      var onClickAnywhere = () => {
        $document.off('click', onClickAnywhere);
        $scope.$apply(() => {
          this.isOpen = false;
        });
      };

      this.openDropdown = () => {
        this.isOpen = true;
        $timeout(() => {
          $document.on('click', onClickAnywhere);
        }, 10);
      };
    }
  ]
});
