import { useContext } from 'react';
import { WalletContext } from './wallet-context';

const useWallet = () => {
  return useContext(WalletContext);
};

const WalletConnectButton = () => {
  const { connectWallet, walletAddress } = useWallet();

  const connectHandler = () => {
    connectWallet()
      .then(console.log)
      .catch(console.error)
      .finally(() => console.log('connect wallet finished'));
  };

  return (
    <button onClick={connectHandler} type="button">
      {walletAddress ? walletAddress : 'Connect Wallet'}
    </button>
  );
};

export { WalletConnectButton };
