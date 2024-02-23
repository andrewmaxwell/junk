const input = `M Shirt: Levi Linscott, Jadon Corra, Josh Govier, Megan Forbes, Noelle Smith, Andrew Maxwell
L Shirt: Hannah Barrow, Krys Curnutt, Daniel Tebeau, Manny Forbes, Peter Gobble, Ilia Zolotov
S Hoodie: Jenna Hickle
M Hoodie: Jadon Corra, Loralee Gobble, Brady Heironimus, Josh Govier, Megan Forbes, Andrew Maxwell, Susan Zolotov, Anneliese Gobble, Kaden Tran, Drake Tran
L Hoodie: Hannah Barrow, Peter Gobble, Nick Smith, Daniel Tebeau, Polina Marchenko, Eliza Zolotov, Noelle Smith
XL Hoodie: Morgan Michalicek, Krys Curnutt, Manny Forbes, Claire Fuller`;

const transform = (input) =>
  Object.values(
    input
      .split('\n')
      .flatMap((line) => {
        const [item, names] = line.split(':');
        return names.split(',').map((name) => [name.trim(), item.trim()]);
      })
      .reduce((groups, [name, item]) => {
        if (!groups[name])
          groups[name] = {
            firstName: name.split(' ')[0],
            lastName: name.split(' ').slice(1).join(' '),
            items: [],
          };
        groups[name].items.push(item);
        return groups;
      }, {})
  )
    .sort(
      (a, b) =>
        a.lastName.localeCompare(b.lastName) ||
        a.firstName.localeCompare(b.firstName)
    )
    .map((p) => `${p.firstName} ${p.lastName}: ${p.items.join(', ')}`)
    .join('\n');

transform(input);

const validate = (str) => {
  const [, min, max, char, password] = str.match(/^(\d+)-(\d+) (\w): (.*)$/);
  const count = password.split(char).length - 1;
  return count >= +min && count <= +max;
};

console.log(validate('0-15 x: xaabxcccxddxxxxxxxxxxxxxda'));
