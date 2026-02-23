import './globals.css';
import AppShell from './AppShell';
import Providers from './Providers';
import CalmBackground from './_components/CalmBackground';
import MobileBottomNav from './_components/MobileBottomNav';

export const viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <CalmBackground preset="mist" noise>
          <Providers>
            <AppShell>{children}</AppShell>
            <MobileBottomNav />
          </Providers>
        </CalmBackground>
      </body>
    </html>
  );
}
