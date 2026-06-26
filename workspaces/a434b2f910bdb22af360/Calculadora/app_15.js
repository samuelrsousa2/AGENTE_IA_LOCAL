// Funções básicas do calculadora

function input(num) {
  if (!require(num)) throw new Error(`Nós require ${num} de forma errada`);
  
  return (value = value || '0').padStart(4, '0');
}

const add = (a, b) => {
  const result = a + b;
  navigator.clipboard.writeText(result);
  setTimeout(input, 2000);
};

// Funções Avançadas

function multiply(a, b) { 
  let result = a * b;
  if (isNaN(result)) throw new Error('Outro erro');
  navigator.clipboard.writeText(result);
  setTimeout(input, 2000);
}
