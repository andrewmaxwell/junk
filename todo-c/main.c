/*
cd todo-c
emcc main.c -o main.js \
    -s WASM=1 \
    -s EXPORTED_FUNCTIONS="['_main','_onAddTodo','_removeItem','_malloc']" \
    -s EXTRA_EXPORTED_RUNTIME_METHODS="['ccall']"
*/

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <emscripten.h>

// --------------------------------------------------------------------
// JavaScript helper functions defined in C using EM_JS
// --------------------------------------------------------------------

// Create the entire UI dynamically. This function creates a container,
// a heading, an input field, an Add button, and a list for the todos.
// All styling and elements are created here.
EM_JS(void, js_init_ui, (), {
  // Create a container div for the app.

  var container = document.createElement('div');
  container.style.margin = '20px';
  container.style.fontFamily = 'sans-serif';

  // Create a header
  var header = document.createElement('h1');
  header.textContent = 'Todo List';
  container.appendChild(header);

  // Create the input field.
  var input = document.createElement('input');
  input.type = 'text';
  input.id = 'todo-input';
  input.placeholder = 'Enter a todo item';
  input.style.fontSize = '1em';
  input.style.padding = '5px';
  container.appendChild(input);

  // Create the Add button.
  var button = document.createElement('button');
  button.id = 'add-button';
  button.textContent = 'Add';
  button.style.fontSize = '1em';
  button.style.padding = '5px 10px';
  button.style.marginLeft = '5px';
  container.appendChild(button);

  // Create an unordered list to hold the todo items.
  var ul = document.createElement('ul');
  ul.id = 'todo-list';
  ul.style.listStyleType = 'none';
  ul.style.padding = '0';
  ul.style.marginTop = '20px';
  container.appendChild(ul);

  // Append the entire container to the document body.
  document.body.appendChild(container);
});

// Add a todo list item to the DOM. The list item is created here
// and an event listener is attached so that clicking it will remove it.
EM_JS(void, js_add_list_item, (const char* text, int id), {
    // Convert the C string to a JavaScript string.
    var itemText = UTF8ToString(text);
    var li = document.createElement("li");
    li.id = "todo-item-" + id;
    li.textContent = itemText;
    li.style.cursor = "pointer";
    li.style.padding = "3px 0";
    // When clicked, call the C function removeItem.
    li.addEventListener("click", function() {
        Module.ccall('removeItem', null, ['number'], [id]);
    });
    document.getElementById("todo-list").appendChild(li);
});

// Clear the text in the input field.
EM_JS(void, js_clear_input, (), {
    document.getElementById("todo-input").value = "";
});

// Get the current value of the input field.
// This function allocates memory for the returned string; the caller must free it.
EM_JS(char*, js_get_input_value, (), {
    var value = document.getElementById("todo-input").value;
    var lengthBytes = lengthBytesUTF8(value) + 1;
    var stringOnWasmHeap = _malloc(lengthBytes);
    stringToUTF8(value, stringOnWasmHeap, lengthBytes);
    return stringOnWasmHeap;
});

// --------------------------------------------------------------------
// Application logic in C
// --------------------------------------------------------------------

// Global counter to give each todo item a unique id.
static int todo_count = 0;

// Add a new todo item by calling the JavaScript helper.
void add_todo(const char* text) {
    js_add_list_item(text, todo_count);
    todo_count++;
}

// This function is called when the user clicks the Add button.
// It reads the input, adds a new todo item if the input is not empty,
// and then clears the input field.
EMSCRIPTEN_KEEPALIVE
void onAddTodo() {
    char* input_value = js_get_input_value();
    if (input_value && strlen(input_value) > 0) {
        add_todo(input_value);
        js_clear_input();
    }
    free(input_value);
}

// Remove a todo item from the DOM given its id.
EMSCRIPTEN_KEEPALIVE
void removeItem(int id) {
    EM_ASM({
        var itemId = "todo-item-" + $0;
        var el = document.getElementById(itemId);
        if (el) {
            el.parentNode.removeChild(el);
        }
    }, id);
}

// --------------------------------------------------------------------
// Main entry point
// --------------------------------------------------------------------
int main() {
    // Build the entire UI from C.
    js_init_ui();

    // Attach an event listener to the Add button to call onAddTodo() when clicked.
    EM_ASM({
        document.getElementById("add-button").addEventListener("click", function() {
            Module.ccall('onAddTodo');
        });
    });

    return 0;
}
