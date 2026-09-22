export const metadata = {
  title: 'ePrint Online',
  description: 'Digital PDF & Online Services',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
