const types = [
  {
    type: 'ISFJ',
    percent: 13.5,
    description: 'Nurturing, Reliable, Practical',
  },
  {
    type: 'ESFJ',
    percent: 12,
    description: 'Sociable, Caring, Organized',
  },
  {
    type: 'ISTJ',
    percent: 11.5,
    description: 'Dependable, Realistic, Methodical',
  },
  {
    type: 'ESTJ',
    percent: 8.5,
    description: 'Efficient, Decisive, Structured',
  },
  {
    type: 'ISFP',
    percent: 8.5,
    description: 'Artistic, Peaceful, Easygoing',
  },
  {
    type: 'ESFP',
    percent: 8.5,
    description: 'Energetic, Spontaneous, Fun-loving',
  },
  {
    type: 'ISTP',
    percent: 5,
    description: 'Analytical, Private, Practical',
  },
  {
    type: 'ESTP',
    percent: 4.5,
    description: 'Bold, Action-Oriented, Adaptable',
  },
  {
    type: 'INFJ',
    percent: 1.5,
    description: 'Insightful, Idealistic, Determined',
  },
  {
    type: 'ENFJ',
    percent: 2.5,
    description: 'Compassionate, Inspirational, Motivational',
  },
  {
    type: 'INTJ',
    percent: 2,
    description: 'Strategic, Logical, Independent',
  },
  {
    type: 'ENTJ',
    percent: 2,
    description: 'Commanding, Structured, Visionary',
  },
  {
    type: 'INFP',
    percent: 4.5,
    description: 'Idealistic, Sensitive, Creative',
  },
  {
    type: 'ENFP',
    percent: 8,
    description: 'Enthusiastic, Creative, Idealistic',
  },
  {
    type: 'INTP',
    percent: 3.5,
    description: 'Intellectual, Logical, Curious',
  },
  {
    type: 'ENTP',
    percent: 3,
    description: 'Inventive, Energetic, Clever',
  },
];

const cells = types
  .map(
    ({type, percent, description}) => `
    <div class="cell">
      <img src="${type}.jpg" alt="${type}: ${description}" />
      <div>${type}: ${description} (~${percent}%)</div>
    </div>`
  )
  .join('');

document.body.innerHTML += `<div style="display: grid; grid-template-columns: repeat(4, 1fr); grid-gap: 10px;">${cells}</div>`;
