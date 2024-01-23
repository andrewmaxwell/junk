export const getData = async () => {
  const [response] = await Promise.all([
    fetch(
      'https://docs.google.com/spreadsheets/d/e/2PACX-1vQ03_eRjHaTw-LlfgdomjIuuGo-aCG6-gK6-zivdQaZonq7AmOEIAua6A5GPh3LFMC4VEQykhRLLBDD/pub?output=xlsx'
    ),
    import(
      // eslint-disable-next-line import/no-unresolved
      'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.17.4/xlsx.full.min.js'
    ),
  ]);

  const {XLSX} = window;
  const data = XLSX.read(await response.arrayBuffer(), {
    cellDates: true,
  }).Sheets;

  return {
    people: XLSX.utils.sheet_to_json(data.People),
    attendance: XLSX.utils.sheet_to_json(data.Attendance),
  };
};
