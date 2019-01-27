import {levels} from './levels.js';
import {BuilderGame} from './game.js';

const {$} = window;

var searchParam = location.search.substring(1);
var levelName = levels[searchParam] ? searchParam : 'Distance';
var game = new BuilderGame(levels[levelName]());

document.title = 'Physics Builder - ' + levelName;

$.fn.paneToggler = function() {
  return $(this).each(function() {
    var self = $(this);
    var title = self.attr('name');
    var hidden = false;
    var content = $('<div>').html(self.html());
    var button = $('<button>')
      .text('Hide ' + title)
      .on('click', function() {
        if (hidden) {
          $(this)
            .text('Hide ' + title)
            .siblings()
            .slideDown();
          hidden = false;
          localStorage.removeItem('hide' + title);
        } else {
          $(this)
            .text('Show ' + title)
            .siblings()
            .slideUp();
          hidden = true;
          localStorage['hide' + title] = true;
        }
      });

    self
      .empty()
      .append(content)
      .append(button);

    if (localStorage['hide' + title]) {
      button.click();
    }
  });
};
$('.pane').paneToggler();
$('#levelSelector')
  .on('change', function() {
    location.hash = '';
    location.search = $(this).val();
  })
  .append(
    Object.keys(levels).map(function(levelName) {
      return $('<option>')
        .val(levelName)
        .text(levelName);
    })
  )
  .val(levelName);

$('#fastForward')
  .change(function() {
    var val = '' + $(this).val();
    if (val && /^[0-9]+$/.test(val)) {
      game.fastForward = val * 60;
    }
  })
  .val(0);

$('#simButton').click(function() {
  if ($(this).text() == 'Simulate') {
    $(this).text('Stop');
    game.startSimulating();
  } else {
    $(this).text('Simulate');
    game.stopSimulating();
  }
});

$('body').on('keypress', function(e) {
  if (e.which == 32) {
    e.preventDefault();
    $('#simButton').click();
  }
});

$(window)
  .on('hashchange', function() {
    game.changeState(location.hash.substring(1));
  })
  .trigger('hashchange');
