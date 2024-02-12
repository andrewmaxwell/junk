export const getMonths = (minX, maxX) => {
  const result = [];
  let currDate = new Date(minX);
  currDate.setDate(1);
  currDate.setHours(0, 0, 0, 0);
  while (currDate < maxX) {
    result.push(new Date(currDate));
    currDate.setMonth(currDate.getMonth() + 1);
  }
  return result;
};
