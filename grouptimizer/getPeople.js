/* global $ */
const dataFields = [
  'name',
  'gender',
  'absent',
  'contrib',
  'weights',
  'sponsor'
];

export default dataUrl =>
  $.getJSON(dataUrl).then(data => {
    const people = data.feed.entry
      .map(row => {
        const person = dataFields.reduce((res, field) => {
          const val = row['gsx$' + field].$t;
          const num = parseFloat(val);
          res[field] = isNaN(num) ? val : num;
          return res;
        }, {});

        person.weights = person.weights
          .split(/\s*,\s*/)
          .reduce((weights, nameAndValue) => {
            const [person2Name, weight] = nameAndValue.split(/\s*:\s*/);
            if (person2Name) weights[person2Name] = parseFloat(weight, 10);
            return weights;
          }, {});

        return person;
      })
      .filter(row => !row.absent);

    people.forEach(person1 => {
      Object.keys(person1.weights).forEach(person2Name => {
        const person2 = people.find(p => p.name === person2Name);
        if (person2) {
          person2.weights[person1.name] = person1.weights[person2Name];
        }
      });
      delete person1.absent;
    });

    return people;
  });
