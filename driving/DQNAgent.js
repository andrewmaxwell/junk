const {tf} = window;

export class DQNAgent {
  constructor(stateSize, actionSize) {
    this.stateSize = stateSize;
    this.actionSize = actionSize;
    this.memory = [];
    this.gamma = 0.95; // Discount factor
    this.epsilon = 1.0; // Exploration rate
    this.epsilonMin = 0.01;
    this.epsilonDecay = 0.995;
    this.learningRate = 0.001;

    this.model = tf.sequential();
    [
      {units: 24, inputShape: [this.stateSize], activation: 'relu'},
      {units: 24, activation: 'relu'},
      {units: this.actionSize, activation: 'linear'},
    ].forEach((layer) => this.model.add(tf.layers.dense(layer)));
    this.model.compile({
      optimizer: tf.train.adam(this.learningRate),
      loss: 'meanSquaredError',
    });
  }

  remember(state, action, reward, nextState, done) {
    this.memory.push({state, action, reward, nextState, done});
  }

  async act(state) {
    if (Math.random() <= this.epsilon) {
      return Math.floor(Math.random() * this.actionSize);
    }
    const qValues = await this.model.predict(tf.tensor2d([state])).data();
    return qValues.indexOf(Math.max(...qValues));
  }

  async replay(batchSize) {
    const minibatch = this.memory.slice(-batchSize);
    for (const {state, action, reward, nextState, done} of minibatch) {
      const target =
        reward +
        (done
          ? 0
          : this.gamma *
            Math.max(
              ...(await this.model.predict(tf.tensor2d([nextState])).data())
            ));
      const targetQ = await this.model.predict(tf.tensor2d([state])).data();
      targetQ[action] = target;
      await this.model.fit(tf.tensor2d([state]), tf.tensor2d([targetQ]), {
        epochs: 1,
      });
    }
    if (this.epsilon > this.epsilonMin) {
      this.epsilon *= this.epsilonDecay;
    }
  }
}
