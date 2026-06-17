import React from 'react';
import { BrowserRouter, Route, Switch } from 'react-router-dom';
import CadastroForm from './CadastroForm';

interface IApp {
  handleSubmit: (event: Event) => void;
}

const App: React.FC<IApp> = ({ handleSubmit }) => {
  return (
    <BrowserRouter>
      <Switch>
        <Route path="/" exact component={CadastrarContainer} />
        {/* Outros routes... */}
      </Switch>
    </BrowserRouter>
  );
};

export default App;

export const handleSubmit = (event: Event) => {
  event.preventDefault();
  // Cadastra o usuário aqui
};
