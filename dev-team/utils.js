export const saveToLocationHash = state => {
  location.hash = btoa(JSON.stringify(state));
};

export const fromLocationHash = () => {
  try {
    return JSON.parse(atob(location.hash.slice(1)));
  } catch (e) {
    return;
  }
};
