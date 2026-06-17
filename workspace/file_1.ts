import React from 'react';

interface ICadastroInput {
  value: string;
  onChange: (event: Event) => void;
}

const CadastroInput: React.FC<ICadastroInput> = ({ value, onChange }) => {
  return (
    <div>
      <label>{value}</label>
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event)}
      />
    </div>
  );
};

export default CadastroInput;
