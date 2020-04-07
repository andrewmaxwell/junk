const {React, Paginator, Table} = window;
const {useState, Fragment} = React;
const {remove, pipe, mergeAll, keys, sortBy, identity} = window.R;

const RenderExpr = ({expr, path = [], onChange, ops, allColumns, onDelete}) => {
  const {minArgs, maxArgs, input} = ops[expr.type] || {};

  const typeSelector = (
    <select
      value={expr.type}
      onChange={({target: {value}}) =>
        value === 'DELETE'
          ? onDelete()
          : value === 'INCREASE_NESTING'
          ? onChange(path, {type: '', args: [expr]})
          : onChange([...path, 'type'], value)
      }
    >
      <option></option>
      {Object.keys(ops).map(op => (
        <option key={op} value={op}>
          {op}
        </option>
      ))}
      {onDelete && <option value="DELETE">[DELETE]</option>}
      <option value="INCREASE_NESTING">[INCREASE NESTING]</option>
    </select>
  );

  return (
    <div style={{borderLeft: '1px solid #DDD', paddingLeft: '15px'}}>
      {typeSelector}

      {expr.args && (
        <Fragment>
          {expr.args.map((c, i) => (
            <RenderExpr
              key={i}
              expr={c}
              path={[...path, 'args', i]}
              onChange={onChange}
              ops={ops}
              allColumns={allColumns}
              onDelete={
                (!minArgs || i >= minArgs) &&
                (() => onChange([...path, 'args'], remove(i, 1, expr.args)))
              }
            />
          ))}
          {expr.args.length < maxArgs && (
            <button
              className="btn btn-default"
              onClick={() => onChange([...path, 'args', expr.args.length], {})}
            >
              + {expr.type}
            </button>
          )}
        </Fragment>
      )}
      {input &&
        input(
          {
            value: expr.value,
            onChange: e => onChange([...path, 'value'], e.target.value)
          },
          allColumns
        )}
    </div>
  );
};

const getFiltered = (data, expr, evaluate) => {
  try {
    return {filtered: data.filter(item => evaluate(expr, item))};
  } catch (error) {
    console.error(error);
    return {filtered: [], error: error.message};
  }
};

const Results = ({
  expr,
  data,
  stringifyExpr,
  evaluate,
  allColumns,
  shownColumns,
  setShownColumns
}) => {
  const pageSize = 10;
  const [page, setPage] = useState(0);
  const [filterEnabled, setFilterEnabled] = useState(true);

  const {filtered, error} = filterEnabled
    ? getFiltered(data, expr, evaluate)
    : {filtered: data};
  return (
    <Fragment>
      {error && <p style={{color: 'red'}}>{error}</p>}
      {/* <pre>{JSON.stringify(expr, null, 2)}</pre> */}

      <label style={{display: 'block', margin: '10px 0'}}>
        Enable Filter:{' '}
        <input
          type="checkbox"
          checked={filterEnabled}
          onChange={e => setFilterEnabled(e.target.checked)}
        />
      </label>

      <p>
        {filtered.length} out of {data.length} rows match{' '}
        <code>{stringifyExpr(expr)}</code>.
      </p>

      <div style={{textAlign: 'right'}}>
        <Paginator
          page={page}
          setPage={setPage}
          pageSize={pageSize}
          numRows={filtered.length}
        />

        <label>
          Add Column:
          <select
            onChange={e => setShownColumns([...shownColumns, e.target.value])}
          >
            <option />
            {allColumns
              .filter(o => !shownColumns.includes(o))
              .map(o => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
          </select>
        </label>
      </div>

      <Table
        columns={shownColumns}
        setColumns={setShownColumns}
        rows={filtered.slice(page * pageSize, (page + 1) * pageSize)}
      />
    </Fragment>
  );
};

window.Render = ({
  data,
  expr,
  ops,
  stringifyExpr,
  evaluate,
  onChange,
  shownColumns,
  setShownColumns
}) => {
  const allColumns = pipe(mergeAll, keys, sortBy(identity))(data);
  return (
    <div className="container">
      <h4>Filter Expression</h4>
      <RenderExpr
        expr={expr}
        onChange={onChange}
        ops={ops}
        allColumns={allColumns}
      />

      {data ? (
        <Results
          expr={expr}
          data={data}
          stringifyExpr={stringifyExpr}
          evaluate={evaluate}
          allColumns={allColumns}
          shownColumns={shownColumns}
          setShownColumns={setShownColumns}
        />
      ) : (
        <span className="velocity-spinner" />
      )}
    </div>
  );
};
