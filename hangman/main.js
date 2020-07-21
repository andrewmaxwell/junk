const {React, ReactDOM, R} = window;
const {assoc, evolve, always, identity} = R;

const solution =
  window.location.hash.length > 1
    ? atob(window.location.hash.slice(1))
    : `
const loadData = async (setState) => {
  const [criteria, user] = await Promise.all([GetGlobalCriteria(), GetUser()]);
  setState(
    mergeLeft({
      user,
      doc: {data: {value: criteria}},
      elements: GetCriteriaElements(criteria),
      displayValues: CriteriaToDisplayValues(criteria),
      loading: false,
    })
  );
};
`;

const notCounted = /\s|;/g;

const App = () => {
  const [{letters, guess, newThing}, setState] = React.useState({
    letters: {},
    guess: '',
    newThing: '',
  });
  const makeGuess = (e) => {
    e.preventDefault();
    const lowerGuess = guess.toLowerCase();
    setState(
      evolve({
        guess: always(''),
        letters:
          guess && !notCounted.test(guess) ? assoc(lowerGuess, true) : identity,
      })
    );
  };
  const newLink =
    window.location.href.split('#')[0] +
    '#' +
    btoa(newThing.replace(/[^\x00-\x7F]/g, ''));
  return (
    <div>
      <pre>
        {solution
          .split('')
          .map((c) => (/\s|;/.test(c) || letters[c.toLowerCase()] ? c : '_'))
          .join('')}
      </pre>
      <div>
        Correct Guesses:{' '}
        {Object.keys(letters)
          .filter((c) => solution.toLowerCase().includes(c.toLowerCase()))
          .join(', ')}
      </div>
      <div>
        Incorrect Guesses:{' '}
        {Object.keys(letters)
          .filter((c) => !solution.toLowerCase().includes(c.toLowerCase()))
          .join(', ')}
      </div>
      <div>
        Remaining:{' '}
        {
          [...new Set(solution.toLowerCase().replace(notCounted, ''))].filter(
            (n) => !letters[n]
          ).length
        }
      </div>
      <form onSubmit={makeGuess}>
        <input
          value={guess}
          style={{width: 32}}
          onChange={(e) => setState(assoc('guess', e.target.value.slice(-1)))}
        />
        <button>Guess</button>
      </form>
      <hr />
      <form>
        <div>To create your own, paste the solution here:</div>
        <textarea
          value={newThing}
          onChange={(e) => setState(assoc('newThing', e.target.value))}
        />
        <br />
        Share this link: <a href={newLink}>{newLink}</a>
      </form>
    </div>
  );
};

ReactDOM.render(<App />, document.getElementById('root'));
