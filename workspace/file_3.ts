import React from 'react';
import CadastrarForm from './CadastrarForm';

interface ICadastroContainer {
  handleSubmit: (event: Event) => void;
}

const CadastrarContainer: React.FC<ICadastroContainer> = ({ handleSubmit }) => {
  return (
    <div>
      <h1>Cadastre-se</h1>
      <CadastrarForm onSubmit={handleSubmit} />
    </div>
  );
};

export default CadastrarContainer;
