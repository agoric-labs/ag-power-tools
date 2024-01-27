import './lib/installSesLockdown.ts';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { ContextProviders } from './lib/context-providers.tsx';
import LaunchIt from './launch.tsx';
import ErrorPage from './error-page';
import './index.css';

const router = createBrowserRouter([
  {
    path: '/',
    element: <LaunchIt />,
    errorElement: <ErrorPage />,
  },
]);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ContextProviders>
      <RouterProvider router={router} />
    </ContextProviders>
  </React.StrictMode>
);
