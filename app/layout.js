export const metadata = {
  title: 'sr_ePrint Online',
  description: 'Digital PDF & Online Services',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
