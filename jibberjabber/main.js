window.angular
  .module('app', [])
  .controller('jjCtrl', function jjCtrl($scope, $http) {
    $scope.books = [
      {title: 'Moby Dick', url: 'moby-dick.txt'},
      {title: 'Alice in Wonderland', url: 'alice-in-wonderland.txt'},
      {title: 'Huckleberry Finn', url: 'huckleberry-finn.txt'},
      {title: 'Tale of Two Cities', url: 'tale-of-two-cities.txt'},
      {title: 'Pride and Prejudice', url: 'pride-and-prejudice.txt'},
      {title: 'King James Bible', url: 'bible.txt'},
      {title: "Reddit's Secrets", url: 'reddit-secrets.txt'}
    ];
    $scope.sub = 6;
    $scope.amount = 3000;
    $scope.removeQuotes = true;
    $scope.normalizeSpacing = true;
    $scope.mostFrequent = [];

    $scope.loadBook = function() {
      $http.get($scope.book.url).then(function({data}) {
        $scope.source = data;
        $scope.go();
      });
    };

    $scope.book = $scope.books[6];
    $scope.loadBook();

    $scope.go = function() {
      var lookBehind = parseInt($scope.sub);
      var text = $scope.source;

      if ($scope.wordsOnly)
        text = $scope.source
          .toLowerCase()
          .match(/\b[a-z][a-z']*\b/g)
          .join(' ');
      else if ($scope.removeQuotes)
        text = $scope.source
          .replace(/["()[\]]/g, '')
          .replace(/([^a-z])'/gi, '$1')
          .replace(/'([^a-z])/gi, '$1');

      if ($scope.normalizeSpacing) text = text.replace(/\s+/g, ' ');

      if (lookBehind > 0 && text.length > lookBehind) {
        $scope.lookBehind = lookBehind;
        $scope.result = generateJibberJabber(text, lookBehind, $scope.amount);
      } else {
        $scope.sub = '';
        document.querySelector('#sub').focus();
      }
    };

    function generateJibberJabber(text, len, amount) {
      text += text.substring(0, len);

      var dex = {};
      var uniqueSubstrings = 0;

      for (let i = 0; i < text.length - len; i++) {
        var pre = text.substring(i, i + len),
          letter = text[i + len];
        if (!dex[pre]) {
          dex[pre] = letter;
          uniqueSubstrings++;
        } else dex[pre] += letter;
      }

      var res = text.substring(0, len);
      for (let i = 0; i < amount; i++) {
        var last = dex[res.substring(i, i + len)];
        res += last[Math.floor(Math.random() * last.length)];
      }

      $scope.uniqueSubstrings = uniqueSubstrings;

      return res;
    }
  });
