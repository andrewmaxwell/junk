// for..of
const getUnapprovedApproversA = (approverInfos) => {
  const result = [];
  for (const approver of approverInfos) {
    if (approver.status !== 'approved') result.push(approver._id);
  }
  return result;
};

// reduce
const getUnapprovedApproversB = (approverInfos) =>
  approverInfos.reduce((result, approver) => {
    if (approver.status !== 'approved') result.push(approver._id);
    return result;
  }, []);

// ramda
const getUnapprovedApproversC = pipe(
  reject(propEq('status', 'approved')),
  pluck('_id')
);

// filter map
const getUnapprovedApproversD = (approverInfos) =>
  approverInfos
    .filter((approver) => approver.status !== 'approved')
    .map((approver) => approver._id);

// for
const getUnapprovedApproversE = (approverInfos) => {
  const result = [];
  for (let i = 0; i < approverInfos.length; i++) {
    if (approverInfos[i].status !== 'approved')
      result.push(approverInfos[i]._id);
  }
  return result;
};

// forEach
const getUnapprovedApproversF = (approverInfos) => {
  const result = [];
  approverInfos.forEach((approver) => {
    if (approver.status !== 'approved') result.push(approver._id);
  });
  return result;
};

// reduce no mutation
const getUnapprovedApproversG = (approverInfos) =>
  approverInfos.reduce(
    (result, approver) =>
      approver.status === 'approved' ? result : [...result, approver._id],
    []
  );

// recursive immutable
const getUnapprovedApproversH = ([approver, ...rest]) =>
  approver
    ? approver.approved
      ? getUnapprovedApproversH(rest)
      : [approver._id, ...getUnapprovedApproversH(rest)]
    : [];

// recursive mutating
const getUnapprovedApproversI = ([approver, ...rest], result = []) => {
  if (!approver) return result;
  if (approver && approver.status !== 'approved') result.push(approver._id);
  return getUnapprovedApproversI(rest, result);
};

const getUnapprovedApproversJ = ([approver, ...rest], result = []) => {};
approver
  ? getUnapprovedApproversI(
      rest,
      approver.status === 'approved' ? result : [...result, approver._id]
    )
  : result;
