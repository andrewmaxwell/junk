let idCounter = 1;
let archive = [];
const networks = ['facebook', 'twitter', 'googlePlus'];

function article(title) {
  this.articleId = idCounter++;
  this.title = title;
  this.filename = title.replace(/ /g, '_').replace(/[^a-z_]/gi, '') + '.txt';
  this.likes = {
    facebook: 0,
    twitter: 0,
    googlePlus: 0,
  };
  archive.push(this);
}

function remove(title) {
  return (archive = archive
    .filter((a) => a.title !== title)
    .map((a, i) => ({...a, articleId: i + 1})));
}

function like(title, network) {
  for (const a of archive) {
    if (a.title === title) {
      a.likes[network]++;
      return a.likes;
    }
  }
}

///////////////////////////
import {Test} from './test.js';
var something = new article('Something!, Something...');
Test.assertEquals(something.articleId, 1, 'optional message');
Test.assertEquals(
  something.filename,
  'Something_Something.txt',
  'optional message'
);

var objectSize = function (obj, num) {
  var count = Object.keys(obj).length;
  return Test.assertEquals(
    count,
    num,
    "You have either changed the 'networks' array or have not produced the correct 'likes' object"
  );
};
objectSize(something.likes, 3);
var fancy = new article('fancy new article');

Test.assertEquals(
  remove('Something!, Something...')[0].articleId,
  1,
  'optional message'
);
