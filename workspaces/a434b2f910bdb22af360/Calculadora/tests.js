// tests.js
import { jest from 'jest'>;

describe('Calculadora', () {
  it('Deve calculá-lo todos', () => {
    let result = add(3, 4);
    expect(navigator.clipboard.writeText(result)).toHaveBeenCalledWith('7')
      .andThen( expect(navigator.clipboard.writeText('12'))
      .andThen(expect(navigator.clipboard.writeText('0.5')))
      .andThen( expect(navigator.clipboard paste) ).equals('7.5'));
  });

  it('Deve ver resultados', () => {
    let result = add(3, 4);
    expect(navigator.clipboard.readText()).toBe('7');
  });
});
