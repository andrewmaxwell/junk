const {React} = window;
const {Fragment} = React;
const {remove} = window.R;

const Paginator = ({page, setPage, pageSize, numRows}) => (
  <Fragment>
    <button
      className="btn btn-default"
      disabled={!page}
      onClick={() => setPage(page - 1)}
    >
      ⇦
    </button>

    {page * pageSize +
      '-' +
      Math.min((page + 1) * pageSize, numRows) +
      ' of ' +
      numRows}

    <button
      className="btn btn-default"
      disabled={(page + 1) * pageSize >= numRows}
      onClick={() => setPage(page + 1)}
    >
      ⇨
    </button>
  </Fragment>
);

const RenderData = ({data}) =>
  Array.isArray(data) && data.length ? (
    <ol>
      {data.map((val, i) => (
        <li key={i}>
          <RenderData key={i} data={val} />
        </li>
      ))}
    </ol>
  ) : data && typeof data === 'object' ? (
    <div style={{marginLeft: '10px'}}>
      {Object.keys(data)
        .sort()
        .map(key => (
          <div key={key}>
            <strong>{key}:</strong> <RenderData key={key} data={data[key]} />
          </div>
        ))}
    </div>
  ) : (
    String(data)
  );

const Table = ({columns, setColumns, rows}) => {
  const swapCol = (a, b) => {
    setColumns(columns.map((c, i) => columns[i === a ? b : i === b ? a : i]));
  };
  return (
    <table className="table table-condensed table-striped">
      <thead>
        <tr>
          {columns.map((c, i) => (
            <th key={c}>
              {c}{' '}
              {i > 0 && (
                <button
                  className="btn btn-default"
                  onClick={() => swapCol(i, i - 1)}
                >
                  ⇦
                </button>
              )}
              <button
                className="btn btn-default"
                onClick={() => setColumns(remove(i, 1, columns))}
              >
                x
              </button>
              {i < columns.length - 1 && (
                <button
                  className="btn btn-default"
                  onClick={() => swapCol(i, i + 1)}
                >
                  ⇨
                </button>
              )}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>
            {columns.map(c => (
              <td key={c}>
                <RenderData data={row[c]} />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
};

Object.assign(window, {Paginator, Table});
