export const metadata = {
  title: "Sort Stack",
  description: "Your daily card-sorting task ritual",
  manifest: "/manifest.json",
  themeColor: "#0f0e0c",
  viewport: {
    width: "device-width",
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Sort Stack" />
      </head>
      <body style={{ margin: 0, padding: 0, background: "#0f0e0c" }}>
        {children}
      </body>
    </html>
  );
}
