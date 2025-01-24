const dbSchema = {
  people: {
    attributes: {
      firstName: {label: 'First Name', type: 'text'},
      lastName: {label: 'Last Name', type: 'text'},
      memberSince: {label: 'Member Since', type: 'date'},
      ministries: {label: 'Ministries', type: 'groups', multiple: true},
      smallGroups: {label: 'Small Groups', type: 'groups', multiple: true},
    },
    toString: ({firstName, lastName}) => `${firstName} ${lastName}`,
  },
  groups: {
    attributes: {
      name: {label: 'Name', type: 'text'},
      type: {label: 'Type', type: 'groupTypes'},
    },
    toString: ({name}) => name,
  },
  groupTypes: {
    attributes: {
      name: {label: 'Type Name', type: 'text'},
    },
    toString: ({name}) => name,
  },
};

const data = {
  people: {
    1: {
      firstName: 'Andrew',
      lastName: 'Maxwell',
      memberSince: '2013-02-03',
      ministries: [1, 2, 3, 4, 5],
      smallGroups: [6],
    },
    2: {
      firstName: 'Andrea',
      lastName: 'Maxwell',
      memberSince: '2013-02-03',
      ministries: [7, 8, 9],
      smallGroups: [6],
    },
  },
  groups: {
    1: {name: 'Children', type: 1},
    2: {name: "Men's Ministry Team", type: 1},
    3: {name: 'Technology', type: 1},
    4: {name: 'Worship Band', type: 1},
    5: {name: 'Youth Sponsor', type: 1},
    6: {name: 'Marchenko Small Group', type: 2},
    7: {name: 'Decorating', type: 1},
    8: {name: 'Mercy', type: 1},
    9: {name: 'Projection', type: 1},
  },
  groupTypes: {
    1: {name: 'ministry'},
    2: {name: 'small group'},
  },
};
