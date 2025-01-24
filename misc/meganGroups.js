import {shuffle} from '../carcassonne/utils.js';

const data = `Megan Forbes	CARE
Nial Magoffin	CARE
Stephanie Schuette	CARE
Mindy Jenkins	CARE
Nancy Eagan	CARE
Brittany Frausto	CARE
Casey Legamaro	CARE
Danielle Powell	CARE
Derek Murray	CARE
Emily Maioranio	CARE
Gretchen Kliewer	CARE
Jacob Lohmann	CARE
Jessica Touchette	CARE
Logan Wilson	CARE
Mark Martinez	CARE
Nermin Dolic	CARE
Ryan Stone	CARE
Steffan McKinney	CARE
Calvin Hofman	CARE
Blake Diehl	CARE
Eliezer Bermudez	CARE
JC Ferral	CARE
Justin Foshee	CARE
Justin Priest	CARE
Kenna Freeborg	CARE
Trisha Ford	CARE
Tyler Rutz	CARE
Amanda Goad	CSM
Amanda Domina	CSM
Ed Reier	CSM
Jason Mullins	CSM
Frances Valdes	CSM
Cheryl Hall	CSM
Emily Nickel	CSM
Paige Frentzel	CSM
Nathan Hansen	CSM
Peggy Hughes	CSM
Richard Copeland	CSM
TJ Rau	CSM
Corey Kuhn	CSM
Lindsey Kruse	CSM
Katie Rizzo	CSM
Annette Spencer	IM
Ashley Newman	IM
Brian Dominik	IM
Daniel Humphrey	IM
Erin Engman	IM
Hannah Bauer	IM
Haui Roark	IM
Jeremy Lentz	IM
Kasey Coad	IM
Kelley Fenner	IM
Safiyyah Moustafa	IM
Michelle Pion  	IM
Mike Boeringa	IM
Ryan Rambo	IM
Tandra Miner	IM
Todd Weedman	IM
Tyler Alexander	IM
Stephanie Ryder 	IM
Amanda Peirick	IM`
  .split('\n')
  .map((r) => r.split('\t'))
  .map(([name, team]) => ({name, team}));

const shuffled = shuffle(data).sort((a, b) => a.team.localeCompare(b.team));

const seen = new Set();

const numTeams = 9;
const groupings = Array.from({length: numTeams}, () => []);
for (let i = 0; i < shuffled.length; i++) {
  groupings[i % numTeams].push(shuffled[i]);

  if (seen.has(shuffled[i].name)) {
    console.log('DUPLICATE', shuffled[i].name);
  }
  seen.add(shuffled[i].name);
}

const result = groupings
  .flatMap((t, i) => [
    `Team ${i + 1}:`,
    ...t.map(({name, team}) => `${name} (${team})`),
    '\n',
  ])
  .join('\n');

console.log(result);
