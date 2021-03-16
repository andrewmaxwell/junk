const multiply = (a, b) => {
  const mult = [];
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      const index = a.length + b.length - i - j - 2;
      mult[index] = (mult[index] || 0) + a[i] * b[j];
    }
  }
  let carry = 0;
  for (let i = 0; i < mult.length || carry; i++) {
    const v = (mult[i] || 0) + carry;
    carry = Math.floor(v / 10);
    mult[i] = v % 10;
  }
  return mult.reverse().join('').replace(/^0+/, '') || '0';
};

const {Test} = require('./test');
Test.assertEquals(multiply('2', '3'), '6');
Test.assertEquals(multiply('30', '69'), '2070');
Test.assertEquals(multiply('11', '85'), '935');

Test.assertEquals(multiply('2', '0'), '0');
Test.assertEquals(multiply('0', '30'), '0');
Test.assertEquals(multiply('0000001', '3'), '3');
Test.assertEquals(multiply('1009', '03'), '3027');

Test.assertEquals(multiply('98765', '56894'), '5619135910');
Test.assertEquals(
  multiply('1020303004875647366210', '2774537626200857473632627613'),
  '2830869077153280552556547081187254342445169156730'
);
Test.assertEquals(
  multiply('58608473622772837728372827', '7586374672263726736374'),
  '444625839871840560024489175424316205566214109298'
);
Test.assertEquals(
  multiply('9007199254740991', '9007199254740991'),
  '81129638414606663681390495662081'
);
