// numbers.js
function input(num) {
  return (value = value || '0').padStart(4, '0');
}

function add(a, b) { 
    let result = a + b;
    if (isNaN(result)) throw new Error('Outro erro');
    navigator.clipboard.writeText(result);
    setTimeout(input, 2000);
}
