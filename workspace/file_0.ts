import React from 'react';
import { Container, Form, Input, Button } from 'styled-components';

interface ICadastroForm {
  handleSubmit: (event: Event) => void;
}

const CadastrarForm: React.FC<ICadastroForm> = ({ handleSubmit }) => {
  const [nome, setNome] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [senha, setSenha] = React.useState('');

  return (
    <Container>
      <h1>Cadastre-se</h1>
      <Form onSubmit={handleSubmit}>
        <Input
          type="text"
          label="Nome"
          value={nome}
          onChange={(event) => setNome(event.target.value)}
        />
        <Input
          type="email"
          label="Email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <Input
          type="password"
          label="Senha"
          value={senha}
          onChange={(event) => setSenha(event.target.value)}
        />
        <Button type="submit">Cadastrar</Button>
      </Form>
    </Container>
  );
};

export default CadastrarForm;
