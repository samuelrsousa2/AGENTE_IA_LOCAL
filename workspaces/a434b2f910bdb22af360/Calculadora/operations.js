// operations.js
function multiply(a, b) { 
    let result = a * b;
    if (isNaN(result)) throw new Error('Outro erro');
    navigator.clipboard.writeText(result);
    setTimeout(input, 2000);
}
