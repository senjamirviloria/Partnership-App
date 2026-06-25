import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Partnership Territories",
  description: "Partner assignment and territory management",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function () {
                var themeStorageKey = 'partnership_app:theme';
                var root = document.documentElement;
                var media = window.matchMedia('(prefers-color-scheme: dark)');
                var getStoredTheme = function () {
                  try {
                    var theme = window.localStorage.getItem(themeStorageKey);
                    return theme === 'dark' || theme === 'light' ? theme : null;
                  } catch (_error) {
                    return null;
                  }
                };
                var apply = function (isDark) {
                  root.classList.toggle('dark', isDark);
                };
                var applyPreferredTheme = function () {
                  var stored = getStoredTheme();
                  apply(stored ? stored === 'dark' : media.matches);
                };
                applyPreferredTheme();
                if (typeof media.addEventListener === 'function') {
                  media.addEventListener('change', function (event) {
                    if (!getStoredTheme()) {
                      apply(event.matches);
                    }
                  });
                } else if (typeof media.addListener === 'function') {
                  media.addListener(function (event) {
                    if (!getStoredTheme()) {
                      apply(event.matches);
                    }
                  });
                }
              })();
            `,
          }}
        />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
