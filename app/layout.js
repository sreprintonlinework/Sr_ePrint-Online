import Script from "next/script";

export const metadata = {
  title: 'SR INTERNET Online Centre',
  description: 'Digital PDF & Online Services',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Script 
          src="https://checkout.razorpay.com/v1/checkout.js" 
          strategy="beforeInteractive" 
        />
      </body>
    </html>
  );
}
