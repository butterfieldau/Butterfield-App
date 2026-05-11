import { ScrollViewStyleReset } from 'expo-router/html';
import React from 'react';

const DESCRIPTION =
  'Order freshly baked cookies, specialty coffee, and desserts from Butterfield — ' +
  "Sydney's premium café. Browse the full menu, earn loyalty points, and order online " +
  'for pickup or delivery.';

export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no"
        />

        <title>Butterfield Cookies — Sydney's Premium Café</title>
        <meta name="description" content={DESCRIPTION} />
        <meta name="robots" content="index, follow" />

        <meta property="og:site_name" content="Butterfield Cookies" />
        <meta property="og:title" content="Butterfield Cookies — Sydney's Premium Café" />
        <meta property="og:description" content={DESCRIPTION} />
        <meta property="og:type" content="website" />

        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content="Butterfield Cookies — Sydney's Premium Café" />
        <meta name="twitter:description" content={DESCRIPTION} />

        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}
