// node jira/getData

const fetch = require('node-fetch');
const {writeFileSync, readFileSync, existsSync} = require('fs');
const Papa = require('papaparse');

const jiraUrl = 'http://jira.monsanto.com/rest/api/2';
const estimateField = 'customfield_10002';
const epicField = 'customfield_10640';
const fields = ['summary', estimateField, epicField].join(',');
const msPerDay = 3600 * 1000 * 24;

const auth = readFileSync('../auth.txt');

// const log = (data) =>
//   console.log(require('util').inspect(data, {depth: Infinity, colors: true}));

const cacheJSON = async (filename, func) => {
  if (existsSync(filename)) return JSON.parse(readFileSync(filename));
  const data = await func();
  writeFileSync(filename, JSON.stringify(data));
  return data;
};

const getData = async () => {
  const result = [];
  let startAt = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const url = `${jiraUrl}/search?startAt=${startAt}&fields=${fields}&expand=changelog&jql=project%3DMKF`;
    console.log(url);

    const data = await cacheJSON(`jira/cache/${startAt}.json`, () =>
      fetch(url, {headers: {Authorization: `Basic ${auth}`}}).then((r) =>
        r.json()
      )
    );

    // log(data);
    if (!data.issues.length) break;
    result.push(data);
    startAt += data.issues.length;
  }
  return result;
};

const replaceEpics = (items) => {
  const itemSummaryIndex = items.reduce((res, el) => {
    res[el.key] = el.summary;
    return res;
  }, {});
  return items.map((el) => ({
    ...el,
    epic: itemSummaryIndex[el.epic] || el.epic,
  }));
};

const processChangelog = (changelog) => {
  const changes = changelog.histories
    .flatMap(({created: date, items}) =>
      items.map(({field, toString: value}) => ({date, field, value}))
    )
    .filter(({field}) => field === 'status' || field === 'assignee');

  let total = 0;
  let start = 0;
  let finished = '';
  const assignees = new Set();
  for (const {date, field, value} of changes) {
    if (
      !start &&
      ((field === 'assignee' && value) ||
        (field === 'status' && value === 'In Progress'))
    ) {
      start = date;
    } else if (
      start &&
      ((field === 'assignee' && !value) ||
        (field === 'status' && value === 'Resolved'))
    ) {
      total += Date.parse(date) - Date.parse(start);
      start = 0;
      finished = date;
    }
    if (field === 'assignee' && value) assignees.add(value);
  }
  return {
    finished,
    days: Math.round((total / msPerDay) * 100) / 100,
    assignees: [...assignees]
      .join(', ')
      .replace(/([A-Z]+), ([A-Z]+)( \w)?/g, '$2 $1')
      .replace(/ \[AG(-Contractor)?\/\d+]| \w$/g, ''),
  };
};

const processIssue = ({key, fields, changelog}) => {
  const {finished, days, assignees} = processChangelog(changelog);
  const estimate = fields[estimateField];
  return {
    key,
    summary: fields.summary,
    estimate,
    days,
    pointsPerDay:
      Math.round((fields[estimateField] / Math.max(0.1, days)) * 100) / 100 ||
      0,
    epic: fields[epicField],
    finished,
    assignees,
  };
};

const getStories = async () => {
  const processed = replaceEpics(
    (await getData()).flatMap((data) => data.issues.map(processIssue))
  )
    .filter(({finished}) => finished)
    // .sort((a, b) => a.finished.localeCompare(b.finished));
    .sort(
      (a, b) =>
        b.pointsPerDay - a.pointsPerDay || a.finished.localeCompare(b.finished)
    );

  // writeFileSync('jira/data.json', JSON.stringify(processed));
  writeFileSync('jira/data.csv', Papa.unparse(processed));
};

getStories();
