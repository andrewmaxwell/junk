const alphaNum = `a	b	c	d	e	1	2	3
f	g	h	i	j	4	5	6
k	l	m	n	o	7	8	9
p	q	r	s	t	.	@	0
u	v	w	x	y	z	_	/
A#	SP`;

const symbols = `^	~	?	!	'	"	(	)
-	:	;	+	&	%	*	=
<	>	€	£	$	¥	¤	\\
[	]	{	}	,	.	@	§
#	¿	¡				_	/
A#	SP`;

const index = {};
[alphaNum, alphaNum.toUpperCase(), symbols].forEach((chars, mode) =>
  chars.split('\n').forEach((row, y) => {
    row.split('\t').forEach((char, x) => {
      if (index[char]) index[char].modes.push(mode);
      else index[char] = {x, y, modes: [mode]};
    });
  })
);

const tvRemote = words => {
  let prev = index.a;
  let mode = 0;
  let result = 0;

  const moveToAndPress = to => {
    const dx = Math.abs(prev.x - to.x);
    const dy = Math.abs(prev.y - to.y);
    result += Math.min(dx, 8 - dx) + Math.min(dy, 6 - dy) + 1;
    prev = to;
  };

  for (const letter of words) {
    const c = letter === ' ' ? index.SP : index[letter];
    if (!c) throw new Error(`BAD: ${letter}`);
    while (!c.modes.includes(mode)) {
      moveToAndPress(index['A#']);
      mode = (mode + 1) % 3;
    }
    moveToAndPress(c);
  }
  return result;
};

const {it, Test} = require('./test.js');
it('example', function() {
  Test.assertEquals(tvRemote('Too Easy?'), 71);
});
it('lower', function() {
  Test.assertEquals(tvRemote('does'), 16);
  Test.assertEquals(tvRemote('your'), 21);
  Test.assertEquals(tvRemote('solution'), 33);
  Test.assertEquals(tvRemote('work'), 18);
  Test.assertEquals(tvRemote('for'), 12);
  Test.assertEquals(tvRemote('these'), 27);
  Test.assertEquals(tvRemote('words'), 23);
});
it('upper', function() {
  Test.assertEquals(tvRemote('DOES'), 19);
  Test.assertEquals(tvRemote('YOUR'), 22);
  Test.assertEquals(tvRemote('SOLUTION'), 34);
  Test.assertEquals(tvRemote('WORK'), 19);
  Test.assertEquals(tvRemote('FOR'), 15);
  Test.assertEquals(tvRemote('THESE'), 28);
  Test.assertEquals(tvRemote('WORDS'), 24);
});
it('symbols', function() {
  Test.assertEquals(tvRemote('^does^'), 33);
  Test.assertEquals(tvRemote('$your$'), 53);
  Test.assertEquals(tvRemote('#solution#'), 49);
  Test.assertEquals(tvRemote('\u00bfwork\u00bf'), 34);
  Test.assertEquals(tvRemote('{for}'), 38);
  Test.assertEquals(tvRemote('\u00a3these\u00a3'), 57);
  Test.assertEquals(tvRemote('?symbols?'), 54);
});

const assocPath = ([first, ...rest], val, obj) =>
  first ? {...obj, [first]: assocPath(rest, val, obj[first] || {})} : val;

const convertQueryToMap = query =>
  query.split('&').reduce((res, part) => {
    const [path, val] = part.split('=');
    return path
      ? assocPath(path.split('.'), decodeURIComponent(val), res)
      : res;
  }, {});
