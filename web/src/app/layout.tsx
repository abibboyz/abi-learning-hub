import type { Metadata } from "next";
import "./globals.css";
import { Shell } from "@/components/layout/Shell";

export const metadata: Metadata = {
  title: "abi-learning-hub — Database Relationships Lab",
  description:
    "One learning platform for SQLAlchemy, Prisma (TS/JS), relational modeling and Playwright test automation. One Docker Compose command; pick a track in the UI.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        {/* Apply the saved theme before first paint (system | dark | light), so there is no flash. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('alh:theme')||'system';var d=t==='dark'||(t==='system'&&!matchMedia('(prefers-color-scheme: light)').matches);var c=document.documentElement.classList;c.toggle('dark',d);c.toggle('light',!d)}catch(e){}`,
          }}
        />
      </head>
      <body>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-accent focus:px-3 focus:py-2 focus:text-on-accent"
        >
          Skip to content
        </a>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
