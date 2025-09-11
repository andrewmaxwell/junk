const dayScore = ({energy, mood}) => (energy + mood - 2) / 8;

const getStartOfWeek = (date) => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day;
  return new Date(d.setDate(diff));
};

const processData = (csv) => {
  const dataByDate = new Map();
  const {data} = window.Papa.parse(csv, {header: true});

  for (const row of data) {
    if (!row.Timestamp) continue;
    const date = new Date(row.Timestamp.split(' ')[0]);
    const dateString = date.toISOString().slice(0, 10);

    if (dataByDate.has(dateString)) {
      console.warn(`Duplicate date found, ignoring: ${dateString}`);
      continue;
    }

    dataByDate.set(dateString, {
      date,
      energy: +row['Energy Level'],
      anxiety: +row['Anxiety Level'],
      headache: +row.Headache,
      mood: +row.Mood,
      exercise: +row.Exercise,
      notes: row.Notes,
    });
  }
  return dataByDate;
};

const generateGrid = (dataByDate) => {
  const sortedDates = [...dataByDate.values()]
    .map((d) => d.date)
    .sort((a, b) => a - b);
  const firstDate = sortedDates[0];
  const lastDate = sortedDates[sortedDates.length - 1];

  const grid = [];
  let currentWeek = [];
  const currentDate = getStartOfWeek(firstDate);

  while (currentDate <= lastDate) {
    for (let i = 0; i < 7; i++) {
      const dateString = currentDate.toISOString().slice(0, 10);
      currentWeek.push(dataByDate.get(dateString) || null);
      currentDate.setDate(currentDate.getDate() + 1);
    }
    grid.push(currentWeek);
    currentWeek = [];
  }
  return grid;
};

const url =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vSJVwYZ2gbAbspXeH2zmZE9S5tXw1J7GyPOfuPJ-7hVu7XggltJrZ0i7G-nNhWzCi502wz5qBq4pQ3X/pub?output=csv';

const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

async function go() {
  const response = await fetch(url);
  const csvText = await response.text();
  const dataMap = processData(csvText);
  const weeks = generateGrid(dataMap);

  const rows = weeks.map(
    (week) => `
    <tr>
    ${week
      .map((day) => {
        if (!day) return `<td></td>`;
        const title = `Energy: ${day.energy}\nAnxiety: ${day.anxiety}\nHeadache: ${day.headache}\nMood: ${day.mood}\nExercise: ${day.exercise}\nNotes: ${day.notes}`;
        const style = `background-color: hsl(${dayScore(day) * 120}, 100%, 50%)`;
        return `<td title="${title}" style="${style}">${day.date.toLocaleDateString().split('/').slice(0, 2).join('/')}</td>`;
      })
      .join('')}
    </tr>`,
  );

  const table = document.createElement('table');
  table.innerHTML = `
    <thead>
      <tr>
        ${days.map((day) => `<th>${day}</th>`).join('')}
      </tr>
    </thead>
    <tbody>${rows.join('')}</tbody>
  `;
  document.body.appendChild(table);

  // log the notes from each week
  const notes = Object.fromEntries(
    weeks.map((week, i) => [
      i,
      week
        .map((day, i) => (day ? `${days[i]}: ${day.notes}` : ''))
        .filter(Boolean)
        .join('\n'),
    ]),
  );
  console.log(JSON.stringify(notes, null, 2));
}

go();
