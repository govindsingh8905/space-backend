import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'NEXUS | Orbital Debris Detection & Collision Avoidance',
  description: 'AI-powered real-time debris tracking and collision avoidance for LEO satellites.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="bg-[#030712]">
      <body className="antialiased overflow-x-hidden">
        {children}
      </body>
    </html>
  );
}
