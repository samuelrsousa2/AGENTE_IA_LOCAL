import React from 'react';

interface ICadastroButton {
  type: string;
}

const CadastroButton: React.FC<ICadastroButton> = ({ type }) => {
  return (
    <button type={type}>
      {type === 'submit' ? 'Cadastrar' : 'Entrar'}
    </button>
  );
};

export default CadastroButton;
