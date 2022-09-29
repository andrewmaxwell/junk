class TestController {
  constructor(dataSource) {
    this.data = dataSource;
  }

  dispatch({payload, query, method}) {
    console.log({payload, query, method}, this.data);

    const [prop, val] = query.slice(1).split('=');

    switch (method) {
      case 'GET': {
        return {
          status: 200,
          body: query ? this.data.filter((d) => d[prop] == val) : this.data,
        };
      }
      case 'POST': {
        if (
          payload.id === undefined ||
          this.data.some((d) => d.id == payload.id)
        ) {
          return {status: 400, body: []};
        }
        this.data.push(payload);
        return {status: 201, body: [payload]};
      }
      case 'PUT': {
        if (!this.data.some((d) => d.id == payload.id)) {
          return {status: 400, body: []};
        }
        this.data = this.data.map((ob) => (ob[prop] == val ? payload : ob));
        return {status: 202, body: [payload]};
      }
      case 'DELETE': {
        if (!query || !this.data.some((d) => d[prop] == val)) {
          return {status: 400, body: []};
        }
        this.data = this.data.filter((ob) => ob[prop] != val);
        return {status: 200, body: []};
      }
    }
  }
}

import {Test, it} from './test.js';
Test.failFast = true;

let dataSource = [
  {
    id: 1,
    name: 'Ada',
    job: 'Programmer',
  },
  {
    id: 2,
    name: 'Kyle',
    job: 'Programmer',
  },
  {
    id: 3,
    name: 'Adam',
    job: 'QA Engineer',
  },
];

let request, response;
let controller = new TestController(dataSource);

it('GET Requests', function () {
  request = {
    payload: {},
    query: '?job=Programmer',
    method: 'GET',
  };

  response = controller.dispatch(request);
  Test.assertDeepEquals(response, {
    status: 200,
    body: [
      {
        id: 1,
        name: 'Ada',
        job: 'Programmer',
      },
      {
        id: 2,
        name: 'Kyle',
        job: 'Programmer',
      },
    ],
  });

  request = {
    payload: {},
    query: '?id=1',
    method: 'GET',
  };

  response = controller.dispatch(request);
  Test.assertDeepEquals(response, {
    status: 200,
    body: [
      {
        id: 1,
        name: 'Ada',
        job: 'Programmer',
      },
    ],
  });

  request = {
    payload: {},
    query: '?name=Lex',
    method: 'GET',
  };

  response = controller.dispatch(request);
  Test.assertDeepEquals(response, {
    status: 200,
    body: [],
  });
});

it('POST Requests', function () {
  request = {
    payload: {
      id: 4,
      name: 'George',
      job: 'Beta Tester',
    },
    query: '',
    method: 'POST',
  };

  response = controller.dispatch(request);
  Test.assertDeepEquals(response, {
    status: 201,
    body: [
      {
        id: 4,
        name: 'George',
        job: 'Beta Tester',
      },
    ],
  });
});

it('PUT Requests', function () {
  request = {
    payload: {
      id: 2,
      name: 'Adam',
      job: 'UX Designer',
    },
    query: '?id=2',
    method: 'PUT',
  };

  response = controller.dispatch(request);
  Test.assertDeepEquals(response, {
    status: 202,
    body: [
      {
        id: 2,
        name: 'Adam',
        job: 'UX Designer',
      },
    ],
  });
});

it('DELETE Requests', function () {
  request = {
    payload: {},
    query: '?name=Adam',
    method: 'DELETE',
  };

  response = controller.dispatch(request);
  Test.assertDeepEquals(response, {
    status: 200,
    body: [],
  });
});

it('GET Requests', function () {
  request = {
    payload: {},
    query: '',
    method: 'GET',
  };

  response = controller.dispatch(request);
  Test.assertDeepEquals(response, {
    status: 200,
    body: [
      {
        id: 1,
        name: 'Ada',
        job: 'Programmer',
      },
      {
        id: 4,
        name: 'George',
        job: 'Beta Tester',
      },
    ],
  });
});

dataSource = [
  {
    id: 1,
    name: 'Ada',
    job: 'Programmer',
  },
];

controller = new TestController(dataSource);

it('POST Requests', function () {
  request = {
    payload: {},
    query: '',
    method: 'POST',
  };

  response = controller.dispatch(request);
  Test.assertDeepEquals(response, {
    status: 400,
    body: [],
  });
});

it('PUT Requests', function () {
  request = {
    payload: {
      id: 2,
      name: 'Adam',
      job: 'UX Designer',
    },
    query: '?id=2',
    method: 'PUT',
  };

  response = controller.dispatch(request);
  Test.assertDeepEquals(response, {
    status: 400,
    body: [],
  });

  request = {
    payload: {
      id: 2,
      name: 'Adam',
      job: 'UX Designer',
    },
    query: '',
    method: 'PUT',
  };

  response = controller.dispatch(request);
  Test.assertDeepEquals(response, {
    status: 400,
    body: [],
  });
});

it('DELETE Requests', function () {
  request = {
    payload: {},
    query: '?name=Adam',
    method: 'DELETE',
  };

  response = controller.dispatch(request);
  Test.assertDeepEquals(response, {
    status: 400,
    body: [],
  });

  request = {
    payload: {},
    query: '',
    method: 'DELETE',
  };

  response = controller.dispatch(request);
  Test.assertDeepEquals(response, {
    status: 400,
    body: [],
  });
});
