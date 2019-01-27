const {$} = window;

export const Controls = ({instructions}) => {
  var C = $(
      "<div style='position:absolute;top:0;right:20px;background-color:rgba(0,0,0,.5);color:white;text-shadow:0 1px rgba(0,0,0,.5);padding:0 10px;border-bottom-left-radius:4px;border-bottom-right-radius:4px;font:12px Georgia'>"
    ).appendTo('body'),
    w = 250,
    D = $('<div>')
      .css({width: w})
      .appendTo(C)
      .hide();
  $(
    "<a href='javascript:void 0' style='color:white;float:right;text-decoration:none'>Instructions &amp; Controls</a>"
  )
    .appendTo(C)
    .click(function() {
      var $this = $(this);
      if (D.is(':visible')) {
        D.slideUp();
        $this.html('Instructions &amp; Controls');
        C.animate({width: $this.width()});
      } else {
        C.animate({width: w}, function() {
          D.slideDown();
          $this.html('Hide');
        });
      }
    });
  if (instructions)
    $('<p>')
      .appendTo(D)
      .html(instructions);
};
