const G = 6.6743e-11; // m3/kg/s2
const c = 299_792_458; // m/s

// const sRad = (mass) => (2 * G * mass) / c ** 2;

const rad = (d) => Math.sqrt((3 * c ** 2) / (8 * G * Math.PI) / d);

// console.log(((rad(22590) * 2 * 100) / 2.54 / 12 / 5280).toLocaleString());

console.log(Math.log2((4 / 3) * Math.PI * rad(1) ** 3 * 1e9));

/*

Rs = 2Gm/c**2

R = 



*/
