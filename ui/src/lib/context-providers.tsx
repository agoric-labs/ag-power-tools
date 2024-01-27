import { FC, PropsWithChildren } from 'react';
// import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
// import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { NetworkContextProvider } from './network-context';
import { WalletContextProvider } from './wallet-context';

const ContextProviders: FC<PropsWithChildren> = ({ children }) => (
  <NetworkContextProvider>
    <WalletContextProvider>{children}</WalletContextProvider>
  </NetworkContextProvider>
);

export { ContextProviders };
