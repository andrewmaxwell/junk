module.exports = {
  globals: Object.keys(require('ramda')).reduce((acc, key) => {
    acc[key] = 'readonly';
    return acc;
  }, {}),
};
