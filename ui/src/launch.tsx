import { FormEventHandler, useRef, useState } from 'react';
import './App.css';
import { WalletConnectButton } from './lib/wallet-connect.tsx';

const NameInput = ({ label, name }: { label: string; name: string }) => {
  const [val, setVal] = useState('');
  const onChange = (ev: FormEvent) => setVal(ev.target.value);

  return (
    <label>
      {label}:
      <input
        name={name}
        value={val}
        onChange={onChange}
        className={val > '' ? 'ok' : 'error'}
      />
    </label>
  );
};

export const Launch = () => {
  const form = useRef(null);

  const makeLaunchOffer: FormEventHandler<HTMLFormElement> = evt => {
    if (!evt.target) {
      return;
    }
    const formData = Array.from(evt.target.elements)
      .filter(el => el.name)
      .reduce((a, b) => ({ ...a, [b.name]: b.value }), {});
    console.log(formData);
    // alert(JSON.stringify(formData, null, 2));
    evt.preventDefault();
    return false;
  };

  return (
    <div>
      <WalletConnectButton />
      <form onSubmit={makeLaunchOffer} ref={form}>
        <fieldset className="card">
          <legend>Token Parameters</legend>
          <NameInput name="name" label="Name" />
          <br />
          <label>
            Supply:
            <input
              name="supply"
              type="number"
              step="1"
              min="1"
              defaultValue={1000}
              placeholder="1_000_000"
            />
          </label>
          <br />
          <label>
            Deadline:
            <input name="deadline" type="datetime-local" />
          </label>
          <br />
          <label>
            Decimal Places:
            <input
              name="decimalPlaces"
              type="number"
              step="1"
              min="1"
              size={4}
              defaultValue={6}
            />
          </label>
          <br />
          <button type="submit">Launch</button>
        </fieldset>
      </form>
    </div>
  );
};

export default Launch;
