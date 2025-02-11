import {init} from './microframework.js';
import {transpile} from './transpile.js';

const defaultCode = `(defun getProp (name obj)
  (cond
    (obj (cond
      ((eq name (car (car obj))) (car (cdr (car obj))))
      ('t (getProp name (cdr obj)))))
    ('t '())))

(defun deleteProp (name obj)
  (cond
    (obj (cond 
      ((eq name (car (car obj))) (cdr obj))
      ('t (cons (car obj) (deleteProp name (cdr obj))))))
    ('t '())))

(defun setProp (name value obj)
  (cons 
    (list name value) 
    (deleteProp name obj)))

(defun map (func arr)
  (cond (arr (cons (func (car arr)) (map func (cdr arr))))
    ('t arr)))

(defun not (x) (cond (x 0) (1 1)))

(defun onChangeInput (state value) 
  (setProp 'inputValue value state))

(defun blankInput (state)
  (setProp 'inputValue "" state))

(defun createTodo (text) 
  (list 
    (list 'text text)
    '(completed 0)))

(defun addTodo (state)
  (setProp 
    'todos 
    (cons
      (createTodo (getProp 'inputValue state))
      (getProp 'todos state))
    state))

(defun onAdd (state)
  (blankInput (addTodo state)))

(defun toggle (todo)
  (setProp 
    'completed 
    (not (getProp 'completed todo))
    todo))

(defun onToggle (state todo)
  (setProp 
    'todos 
    (map 
      (lambda (t)
        (cond
          ((eq t todo) (toggle t))
          ('else t)))
      (getProp 'todos state))
    state))

(defun renderItem (todo)
  (list
    '(tag li)
    (list
      'children
      (list
        (list
          '(tag input)
          '(type checkbox)
          (list 'checked (getProp 'completed todo))
          (list 'onClick (lambda (state) (onToggle state todo))))
        (list
          '(tag span)
          (list 'style (list
            (list 'textDecoration (cond
              ((getProp 'completed todo) "line-through")
              (1 "none")))))
          (list 'textContent (getProp 'text todo)))))))

(defun render (state) 
  (list
    '((tag h1) (textContent "Todo List"))
    (list
      '(tag input)
      '(placeholder "Enter a todo item")
      '(style ((fontSize 1em) (padding 5px)))
      (list 'value (getProp 'inputValue state))
      (list 'onChangeValue onChangeInput))
    (list
      '(tag button)
      '(style ((fontSize 1em) (padding 5px)))
      '(textContent "Add")
      (list 'disabled (not (getProp 'inputValue state)))
      (list 'onClick onAdd))
    (list
      '(tag ul)
      '(style ((listStyleType none) (padding 0) (marginTop 20px)))
      (list 'children (map renderItem (getProp 'todos state))))))

(defun getInitialState () '(
  (inputValue "")
  (todos (
    (
      (text "Make a todo list")
      (completed 1))
    (
      (text "Add more features")
      (completed 0))))))
`;

const editor = window.ace.edit('editor');
editor.setTheme('ace/theme/monokai');
editor.session.setMode('ace/mode/lisp');
editor.setValue(defaultCode, 1);

const previewDiv = document.querySelector('#preview');

const update = () => {
  try {
    previewDiv.innerHTML = '';

    const {render, getInitialState} = new Function(
      `${transpile(editor.getValue())}; return {render, getInitialState}`,
    )();
    init(render, getInitialState(), previewDiv);
  } catch (error) {
    console.error(error);
    previewDiv.innerHTML = `<pre style='color: red;'>${error.stack}</pre>`;
  }
};

editor.session.on('change', update);

update();
