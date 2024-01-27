import './App.css';
import { WalletConnectButton } from './lib/wallet-connect.tsx';

export const Launch = () => {
  return (
    <div>
      <WalletConnectButton />
      <fieldset className="card">
        <legend>Token Parameters</legend>
        <label>
          Name:
          <input name="name" />
        </label>
        <br />
        <label>
          Supply:
          <input
            name="supply"
            type="number"
            step="1"
            min="1"
            placeholder="1_000_000"
          />
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
        <button type="button">Launch</button>
      </fieldset>
    </div>
  );
};

export default Launch;
