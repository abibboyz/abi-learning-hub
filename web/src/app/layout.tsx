import type { Metadata } from "next";
import "./globals.css";
import { Shell } from "@/components/layout/Shell";

export const metadata: Metadata = {
  title: "abi-learning-hub — Database Relationships Lab",
  description:
    "Multi-stack learning hub for SQLAlchemy, Prisma (TS/JS), Zod, and relational modeling.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
