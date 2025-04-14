const scheduler = async (tasks) => {
  const taskMap = Object.fromEntries(
    tasks.map((task) => [task.id, {task, unmetCount: 0, dependents: []}]),
  );

  for (const {id, dependencies} of tasks) {
    for (const dep of dependencies) {
      if (!taskMap[dep]) continue;
      taskMap[id].unmetCount++;
      taskMap[dep].dependents.push(taskMap[id]);
    }
  }

  const result = [];
  let wave = tasks.filter(({id}) => taskMap[id].unmetCount === 0);

  while (wave.length) {
    const nextWave = [];
    await Promise.all(
      wave.map(async ({run, id}) => {
        await run();
        result.push(id);
        for (const dep of taskMap[id].dependents) {
          if (--dep.unmetCount) continue;
          nextWave.push(dep.task);
        }
      }),
    );
    wave = nextWave;
  }

  if (result.length !== tasks.length) {
    throw new Error('Cycle detected');
  }
  return result;
};

// const constructWaves = (tasks) => {
//   const taskIndex = Object.fromEntries(tasks.map((t) => [t.id, t])); // for efficient lookups
//   const waveAssignments = {}; // maps ids to assigned waves

//   // adds tasks to correct wave, adding prerequisite tasks recursively as needed
//   const assignWave = (task, stack = []) => {
//     if (!task) return 0; // handles undefined tasks, like dependencies that do not exist

//     if (stack.includes(task.id)) {
//       throw new Error(`Cycle detected: ${[...stack, task.id].join('->')}`);
//     }

//     if (waveAssignments[task.id] === undefined) {
//       const wavesOfDependencies = task.dependencies.map(
//         (taskId) => assignWave(taskIndex[taskId], [...stack, task.id]), // add parent id to stack so cycles can be detected
//       );
//       waveAssignments[task.id] = 1 + Math.max(-1, ...wavesOfDependencies);
//     }
//     return waveAssignments[task.id];
//   };

//   for (const t of tasks) assignWave(t);

//   // transform wave assignments into an array of array of task ids where each array is a wave
//   const waveArray = [];
//   for (const [id, waveIndex] of Object.entries(waveAssignments)) {
//     waveArray[waveIndex] ||= [];
//     waveArray[waveIndex].push(taskIndex[id]);
//   }
//   return waveArray;
// };

// const scheduler = async (tasks) => {
//   const result = [];

//   // for..of runs serially
//   for (const wave of constructWaves(tasks)) {
//     // .map runs in parallel
//     const promises = wave.map(async (t) => {
//       await t.run();
//       result.push(t.id);
//     });
//     await Promise.all(promises);
//   }
//   return result;
// };

const tasks = [
  {id: 'D', dependencies: ['B', 'C', 'X']},
  {id: 'B', dependencies: ['A']},
  {id: 'A', dependencies: []},
  {id: 'F', dependencies: []},
  {id: 'G', dependencies: ['A', 'F']},
  {id: 'E', dependencies: ['D', 'C']},
  {id: 'C', dependencies: ['A']},
].map((t) => ({
  ...t,
  run: async () => {
    await new Promise((r) => setTimeout(r, Math.random() * 400 + 100));
    console.log(t.id + ' done');
  },
}));

console.log(await scheduler(tasks));
