/* eslint-disable */

sort=o=>o.map(_=>{for(j=0;j<o.length;j++)v=o[j+1],o[j]>v&&([o[j],o[j+1]]=[v,o[j]])})

const arr = [4, 5, 7, 8, 9, 6, 7, 8, 1, 2, 3, 7, 5, 4, 0];
sort(arr);
console.log(arr);
