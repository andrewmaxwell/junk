let x = 0x7165498511230n;
let result = '';
while (x) {
  result += String.fromCharCode(
    32 + Number((0xc894a7b75116601n >> (((x >>= 4n) & 15n) * 7n)) & 0x7fn)
  );
}
console.log(result);
