// What each built-in name means, why it's defined the way it is, and an expression that shows it
// in action. The why works backward from what the name has to do to the simplest lambda that does
// it, since that's how these definitions are found.

const names = {
  I: {
    meaning: 'eats one thing and gives it right back.',
    why: `The simplest function there is: whatever goes in comes back out. We want <code>I x = x</code>, so
      <code>I = λx.x</code>.`,
    tryIt: 'I x',
  },
  K: {
    meaning: 'eats two things and keeps the first.',
    why: `K makes constant functions: <code>K x</code> ignores whatever it eats next and gives back
      <code>x</code>. We want <code>K x y = x</code>, so <code>K = λxy.x</code>. That’s the same as
      <code>TRUE</code>: keeping the first of two things is also a way to choose.`,
    tryIt: 'K x y',
  },
  S: {
    meaning:
      'eats x, y, and z, and gives back x z (y z): z goes to both x and y.',
    why: `S shares one input between two functions: <code>S x y z = x z (y z)</code>, so
      <code>S = λxyz.xz(yz)</code>. It’s famous because <code>S</code> and <code>K</code> alone can
      build every other lambda, with no variables at all. For example, <code>S K K</code> works just
      like <code>I</code>.`,
    tryIt: 'S K K x',
  },
  Y: {
    meaning:
      'makes recursion: Y f turns into f applied to a copy of Y f, so f gets a way to call itself.',
    why: `Nothing in lambda calculus can refer to itself by name, so how can a function call itself?
      <code>Y</code> builds the self-reference: we want <code>Y f = f (Y f)</code>, so that
      <code>f</code> is handed a copy of “itself, ready to go again” as its first input. The trick is
      <code>λx.f(xx)</code>: fed to itself, it makes another copy of itself and hands it to
      <code>f</code>. So <code>Y = λf.(λx.f(xx))(λx.f(xx))</code>. Try it on an egg with no alligator,
      and watch <code>f(f(f(…)))</code> pile up forever.`,
    tryIt: 'Y f',
  },
  TRUE: {
    meaning:
      'eats two things and keeps the first. That’s all “true” needs to do: choose the first option.',
    why: `The one thing a program needs from true and false is to choose: if true, do this, otherwise do
      that. So make <code>TRUE</code> <i>be</i> the chooser: given two options, keep the first. We want
      <code>TRUE a b = a</code>, so <code>TRUE = λab.a</code>, and <code>FALSE</code> keeps the second:
      <code>λab.b</code>. Then <code>IF</code> doesn’t need to do anything: <code>IF p a b</code> is
      just <code>p a b</code>.`,
    tryIt: 'TRUE x y',
  },
  FALSE: {
    meaning:
      'eats two things and keeps the second. That’s all “false” needs to do: choose the second option.',
    why: `The one thing a program needs from true and false is to choose: if true, do this, otherwise do
      that. So make them <i>be</i> choosers. <code>TRUE</code> keeps the first of two options and
      <code>FALSE</code> keeps the second. We want <code>FALSE a b = b</code>, so
      <code>FALSE = λab.b</code>.`,
    tryIt: 'FALSE x y',
  },
  NOT: {
    meaning:
      'eats a true or false and swaps the two things it would choose between.',
    why: `<code>NOT p</code> should choose the opposite of what <code>p</code> chooses. Since
      <code>p</code> is a chooser, ask it to choose, but hand it the two options in the other order:
      <code>NOT p a b = p b a</code>. So <code>NOT = λpab.pba</code>.`,
    tryIt: 'NOT TRUE x y',
  },
  AND: {
    meaning:
      'eats p and q. If p is true, the answer is q; otherwise it’s p, which is false.',
    why: `If <code>p</code> is true, <code>p AND q</code> is whatever <code>q</code> is. If
      <code>p</code> is false, it’s false, which is <code>p</code> itself. <code>p</code> is a chooser,
      so let it choose between those two: <code>p q p</code>. So <code>AND = λpq.pqp</code>.`,
    tryIt: 'AND TRUE FALSE',
  },
  OR: {
    meaning:
      'eats p and q. If p is true, the answer is p, which is true; otherwise it’s q.',
    why: `If <code>p</code> is true, <code>p OR q</code> is true, which is <code>p</code> itself.
      Otherwise it’s whatever <code>q</code> is. Let <code>p</code> choose between those two:
      <code>p p q</code>. So <code>OR = λpq.ppq</code>.`,
    tryIt: 'OR FALSE TRUE',
  },
  IF: {
    meaning:
      'eats a true or false and two options, and lets the true or false choose.',
    why: `<code>TRUE</code> and <code>FALSE</code> already do the choosing, so <code>IF</code> has
      nothing left to do: <code>IF p a b = p a b</code>, so <code>IF = λpab.pab</code>. It’s only there
      so programs read nicely.`,
    tryIt: 'IF TRUE x y',
  },
  SUCC: {
    meaning:
      'eats a number n, then f and x, and does f to x one more time than n does: n + 1.',
    why: `A number <code>n</code> means “do <code>f</code> n times” (see any number). n + 1 means doing
      it once more: do <code>f</code> n times, <code>n f x</code>, then once more on top:
      <code>f (n f x)</code>. So <code>SUCC = λnfx.f(nfx)</code>.`,
    tryIt: 'SUCC 2 f x',
  },
  ADD: {
    meaning:
      'eats two numbers m and n, then f and x, and does f to x n times and then m more times: m + n.',
    why: `A number <code>n</code> means “do <code>f</code> n times”: <code>n f x</code> is
      <code>f(f(…f x))</code> with n <code>f</code>s. To add, do <code>f</code> n times,
      <code>n f x</code>, then m more times on top of that: <code>m f (n f x)</code>. So
      <code>ADD = λmnfx.mf(nfx)</code>.`,
    tryIt: 'ADD 2 3 f x',
  },
  MUL: {
    meaning:
      'eats two numbers m and n, then f, and repeats “do f n times” m times: m × n.',
    why: `A number <code>n</code> means “do <code>f</code> n times”: <code>n f x</code> is
      <code>f(f(…f x))</code> with n <code>f</code>s. To multiply, repeat “do <code>f</code> n times” m
      times. “Do <code>f</code> n times” is just <code>n f</code>, so m × n is <code>m (n f)</code>, and
      <code>MUL = λmnf.m(nf)</code>.`,
    tryIt: 'MUL 2 3 f x',
  },
  POW: {
    meaning:
      'eats b and e, and chains e copies of b together: b to the power of e.',
    why: `A number <code>b</code>, given a function, gives back “that function, b times”. Do that e times
      in a row and the count gets multiplied by b each time: b × b × … × b, which is b to the power of
      e. Doing something e times is what <code>e</code> itself does, so <code>POW b e = e b</code>, and
      <code>POW = λbe.eb</code>.`,
    tryIt: 'POW 2 3 f x',
  },
  PRED: {
    meaning:
      'eats n and gives back n − 1 (0 stays 0). It’s famously tricky: it rebuilds n one step behind.',
    why: `Counting down is surprisingly hard, since a number can only repeat something forward. Stephen
      Kleene’s trick (the story goes that it came to him at the dentist) is to count up while remembering
      the previous count: start from the pair (0, 0), and n times turn (a, b) into (b, b + 1). After n
      steps you have (n − 1, n), so keep the first. The definition here,
      <code>λnfx.n(λgh.h(gf))(λu.x)(λu.u)</code>, is a compact version of the same idea: it builds up
      the <code>f</code>s while always staying one behind.`,
    tryIt: 'PRED 3 f x',
  },
  SUB: {
    meaning:
      'eats m and n, and takes one away from m, n times: m − n (stopping at 0).',
    why: `m − n means taking one away from m, n times. Taking one away is <code>PRED</code>, and
      repeating something n times is what <code>n</code> does, so <code>SUB m n = n PRED m</code>, and
      <code>SUB = λmn.n PRED m</code>.`,
    tryIt: 'SUB 3 1 f x',
  },
  ISZERO: {
    meaning: 'eats a number and answers TRUE if it’s 0 and FALSE otherwise.',
    why: `Start with <code>TRUE</code>, and n times, replace whatever you have with <code>FALSE</code>.
      Zero replaces nothing, so it stays <code>TRUE</code>, and any other number ends up
      <code>FALSE</code>. “Replace it with FALSE” is <code>λx.FALSE</code>, so
      <code>ISZERO = λn.n(λx.FALSE)TRUE</code>.`,
    tryIt: 'ISZERO 0',
  },
  PAIR: {
    meaning:
      'eats two things and holds onto them, handing both to whatever it eats next.',
    why: `A pair should hold onto <code>x</code> and <code>y</code> until something wants them. So
      <code>PAIR x y</code> waits for a function <code>f</code> and hands it both: <code>f x y</code>,
      and <code>PAIR = λxyf.fxy</code>. To get one back out, hand it a chooser: <code>FST p</code> is
      <code>p TRUE</code> and <code>SND p</code> is <code>p FALSE</code>.`,
    tryIt: 'FST (PAIR x y)',
  },
  FST: {
    meaning: 'eats a pair and takes out the first thing.',
    why: `A pair <code>PAIR x y</code> hands both its things to whatever it eats: <code>f x y</code>. To
      get the first one, hand it the chooser that keeps the first: <code>FST p = p TRUE</code>, so
      <code>FST = λp.p TRUE</code>.`,
    tryIt: 'FST (PAIR x y)',
  },
  SND: {
    meaning: 'eats a pair and takes out the second thing.',
    why: `A pair <code>PAIR x y</code> hands both its things to whatever it eats: <code>f x y</code>. To
      get the second one, hand it the chooser that keeps the second: <code>SND p = p FALSE</code>, so
      <code>SND = λp.p FALSE</code>.`,
    tryIt: 'SND (PAIR x y)',
  },
};

const number = (n) => ({
  meaning: `is the number ${n}. A number eats two things, f and x, and does f to x ${n === 1 ? 'once' : `${n} times`}.`,
  why: `The one thing every number can do is count how many times to do something. So the number n
    <i>is</i> “do <code>f</code> n times, starting from <code>x</code>”: <code>n f x</code> is
    <code>f(f(…f x))</code> with n <code>f</code>s. That makes 0 = <code>λfx.x</code>, 1 =
    <code>λfx.fx</code>, 2 = <code>λfx.f(fx)</code>, and so on. These are called Church numerals, and
    adding, multiplying, and everything else are built from repeating repetitions.`,
  tryIt: `${n} f x`,
});

// {meaning, why, tryIt} for a built-in name or number, or undefined for anything else
export const about = (name) =>
  /^\d+$/.test(name) ? number(Number(name)) : names[name];

export const builtInNames = Object.keys(names);
