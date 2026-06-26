document.getElementById('areaForm').addEventListener('submit', function(event) {
  event.preventDefault();

  const base = parseFloat(document.getElementById('base').value);
  const altura = parseFloat(document.getElementById('altura').value);

  if (isNaN(base) || isNaN(altura)) {
    document.getElementById('result').textContent = 'Por favor, insira valores numéricos para base e altura.';
    return;
  }

  const area = base * altura;

  document.getElementById('result').textContent = `A área é: ${area} m²`;
});