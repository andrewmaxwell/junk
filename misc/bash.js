const bashToJS = (str) => {
  const res = str
    .replace(/#/g, '//')
    .replace(/\s+;;/g, ';break')
    .replace(/(echo|printf) (-n )?((\$|\w)+|"[^"]*")/g, 'console.log($3)')

    .replace(/(\w+)=/g, 'let $1 = ')
    .replace(/for \(\((.+)\)\)/g, 'for ($1)')
    .replace(/\[/g, '(')
    .replace(/]/g, ')')
    .replace(/"([^"]*)"/g, (m, s) =>
      /\$\w/.test(s) ? '`' + s.replace(/\$(\w+)/g, '${$1}') + '`' : m
    )
    .replace(/\$(\w+)/g, '$1') // remove leading $ signs from variables
    .replace(/\bdo\b|;?\s+then\b/g, '{')
    .replace(/\b(end|fi|done|esac)\b/g, '}')
    .replace(/else/g, '} else {')
    .replace(/elif/g, '} else if')
    .replace(/case (\w+) in/g, 'switch ($1) {')
    .replace(/\n\*\)/g, '\ndefault:')
    .replace(/\n([^\n())]+)\)/g, '\ncase $1:')
    .replace(/-eq/g, '==')
    .replace(/-lt/g, '<')
    .replace(/\$\{(.+):(.+):(.+)\}/g, '$1.slice($2, $3)')
    .replace(/\n(function )?(\w+)\s*\(\)/, '\nfunction $2(...args)')
    .replace(/read (\w+)/g, 'let $1 = prompt()');

  return (res.match(/(?<=function )\w+/g) || []).reduce(
    (res, f) => res.replace(new RegExp(`\n${f}(.*)`, 'g'), `\n${f}($1)`),
    res
  );
};

import {Test} from './test.js';

Test.assertDeepEquals(
  bashToJS(`
# prints Hello World
echo "Hello World"`),
  `
// prints Hello World
console.log("Hello World")`
);

Test.assertDeepEquals(
  bashToJS(
    `
valid=true
count=1
while [$valid]
do
echo $count
if [ $count -eq 5 ];
then
break
fi
((count++))
done`
  ),
  `
let valid = true
let count = 1
while (valid)
{
console.log(count)
if ( count == 5 ){
break
}
((count++))
}`
);

Test.assertDeepEquals(
  bashToJS(`
for (( counter=10; counter>0; counter-- ))
do
echo -n "$counter "
done
printf "\\n"`),
  `
for ( let counter = 10; counter>0; counter-- )
{
console.log(\`\${counter} \`)
}
console.log("\\n")`
);

Test.assertDeepEquals(
  bashToJS(`
echo "Enter Your Name"
read name
echo "Welcome $name to LinuxHint"`),
  `
console.log("Enter Your Name")
let name = prompt()
console.log(\`Welcome \${name} to LinuxHint\`)`
);

Test.assertDeepEquals(
  bashToJS(`
n=10
if [ $n -lt 10 ];
then
echo "It is a one digit number"
else
echo "It is a two digit number"
fi`),
  `
let n = 10
if ( n < 10 ){
console.log("It is a one digit number")
} else {
console.log("It is a two digit number")
}`
);

Test.assertDeepEquals(
  bashToJS(`
echo "Enter username"
read username
echo "Enter password"
read password

if [[ ( $username == "admin" && $password == "secret" ) ]]; then
echo "valid user"
else
echo "invalid user"
fi`),
  `
console.log("Enter username")
let username = prompt()
console.log("Enter password")
let password = prompt()

if (( ( username == "admin" && password == "secret" ) )){
console.log("valid user")
} else {
console.log("invalid user")
}`
);

Test.assertDeepEquals(
  bashToJS(`
echo "Enter any number"
read n

if [[ ( $n -eq 15 || $n  -eq 45 ) ]]
then
echo "You won the game"
else
echo "You lost the game"
fi`),
  `
console.log("Enter any number")
let n = prompt()

if (( ( n == 15 || n  == 45 ) )){
console.log("You won the game")
} else {
console.log("You lost the game")
}`
);

Test.assertDeepEquals(
  bashToJS(`
echo "Enter your lucky number"
read n

if [ $n -eq 101 ];
then
echo "You got 1st prize"
elif [ $n -eq 510 ];
then
echo "You got 2nd prize"
elif [ $n -eq 999 ];
then
echo "You got 3rd prize"

else
echo "Sorry, try for the next time"
fi`),
  `
console.log("Enter your lucky number")
let n = prompt()

if ( n == 101 ){
console.log("You got 1st prize")
} else if ( n == 510 ){
console.log("You got 2nd prize")
} else if ( n == 999 ){
console.log("You got 3rd prize")

} else {
console.log("Sorry, try for the next time")
}`
);

Test.assertDeepEquals(
  bashToJS(`
echo "Enter your lucky number"
read n
case $n in
101)
echo "You got 1st prize" ;;
510)
echo "You got 2nd prize" ;;
999)
echo "You got 3rd prize" ;;
*)
echo "Sorry, try for the next time" ;;
esac`),
  `
console.log("Enter your lucky number")
let n = prompt()
switch (n) {
case 101:
console.log("You got 1st prize");break
case 510:
console.log("You got 2nd prize");break
case 999:
console.log("You got 3rd prize");break
default:
console.log("Sorry, try for the next time");break
}`
);

Test.assertDeepEquals(
  bashToJS(
    `
Str="Learn Linux from LinuxHint"
subStr=\${Str:6:5}
echo $subStr`
  ),
  `
let Str = "Learn Linux from LinuxHint"
let subStr = Str.slice(6, 5)
console.log(subStr)`
);

Test.assertDeepEquals(
  bashToJS(
    `
function F1()
{
echo 'I like bash programming'
}

F1`
  ),
  `
function F1(...args)
{
echo 'I like bash programming'
}

F1()`
);

Test.assertDeepEquals(bashToJS(`echo $((5 + 6))`), `console.log(5 + 6)`);

Test.assertDeepEquals(
  bashToJS(
    `
Rectangle_Area() {
area=$(($1 * $2))
echo "Area is : $area"
}

Rectangle_Area 10 20`
  ),
  `
function Rectangle_Area(...args) {
let area = args[0] * args[1];
console.log(\`Area is : \${area}\`)
}

Rectangle_Area (10, 20)
`
);
