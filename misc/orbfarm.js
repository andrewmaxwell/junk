// orb.farm

const algaeId = 4;
const bacteraId = 8;

const o2TooLow = 140;
const o2TooHigh = 250;

const numAlgea = 1000;
const numBacteria = 100;

const place = (num, type) => {
  for (let i = 0; i < num; i++) {
    window.universe.paint(
      Math.floor(Math.random() * 200),
      Math.floor(Math.random() * 200),
      2,
      type
    );
  }
};

const dialElement = document.querySelector('polygon');

const go = () => {
  const angle = +dialElement.style.transform.match(/\d+/)[0];
  console.log('angle', angle);

  if (angle < o2TooLow) {
    console.log('placing', numAlgea, 'algae');
    place(numAlgea, algaeId);
  } else if (angle > o2TooHigh) {
    console.log('placing', numBacteria, 'bacteria');
    place(numBacteria, bacteraId);
  }
};

setInterval(go, 1000);
