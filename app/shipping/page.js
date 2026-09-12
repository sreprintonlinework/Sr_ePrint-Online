export default function ShippingPage() {
  return (
    <main
      style={{
        minHeight: '100vh',
        background: '#f3f6fb',
        fontFamily: 'Arial, sans-serif',
        padding: '20px 12px',
      }}
    >
      <div
        style={{
          maxWidth: '850px',
          margin: '0 auto',
        }}
      >

        {/* HEADER */}
        <section
          style={{
            background:
              'linear-gradient(135deg, #2563eb, #1d4ed8)',
            color: 'white',
            padding: '24px 20px',
            borderRadius: '12px',
            textAlign: 'center',
            marginBottom: '15px',
          }}
        >
          <h1
            style={{
              margin: 0,
              fontSize: '28px',
            }}
          >
            SR E-Print Online
          </h1>

          <p
            style={{
              margin: '6px 0 0',
              fontSize: '15px',
            }}
          >
            Digital PDF & Excel Files
          </p>
        </section>

        {/* CONTENT */}
        <section
          style={{
            background: 'white',
            borderRadius: '12px',
            padding: '22px',
            boxShadow:
              '0 3px 12px rgba(0,0,0,0.06)',
          }}
        >

          <h2
            style={{
              color: '#1e3a8a',
              marginTop: 0,
            }}
          >
            Shipping & Delivery Policy
          </h2>

          <p
            style={{
              lineHeight: 1.6,
              color: '#374151',
            }}
          >
            SR E-Print Online provides digital files
            through electronic delivery. We do not
            ship physical products.
          </p>

          <h3 style={{ color: '#1e3a8a' }}>
            Digital Delivery
          </h3>

          <p
            style={{
              lineHeight: 1.6,
              color: '#374151',
            }}
          >
            After successful payment and payment
            verification, the purchased digital file
            is made available for download on the
            website.
          </p>

          <h3 style={{ color: '#1e3a8a' }}>
            Delivery Time
          </h3>

          <p
            style={{
              lineHeight: 1.6,
              color: '#374151',
            }}
          >
            Digital files are normally delivered
            immediately after successful payment
            verification.
          </p>

          <h3 style={{ color: '#1e3a8a' }}>
            No Physical Shipping
          </h3>

          <p
            style={{
              lineHeight: 1.6,
              color: '#374151',
            }}
          >
            No courier, postal or physical product
            delivery is applicable because all products
            available through this website are digital
            files.
          </p>

          <h3 style={{ color: '#1e3a8a' }}>
            Download Problems
          </h3>

          <p
            style={{
              lineHeight: 1.6,
              color: '#374151',
            }}
          >
            If a purchased file does not download
            correctly after successful payment, please
            contact us with your payment details so
            that we can assist you.
          </p>

          <h3 style={{ color: '#1e3a8a' }}>
            Contact Us
          </h3>

          <p
            style={{
              lineHeight: 1.7,
              color: '#374151',
            }}
          >
            <strong>SR E-Print Online</strong>
            <br />
            Phone / WhatsApp: 9989057683
            <br />
            Email: sronline99890@gmail.com
          </p>

          <p
            style={{
              lineHeight: 1.6,
              color: '#374151',
            }}
          >
            <strong>Business Address:</strong>
            <br />
            Sr internet online center,
            <br />
            New Maa Mart backside, Kurnool Road,
            <br />
            Ieeja, Jogulamba Gadwal District,
            <br />
            Telangana - 509127, India
          </p>

          {/* BACK BUTTON */}
          <div
            style={{
              textAlign: 'center',
              marginTop: '20px',
            }}
          >
            <a
              href="/"
              style={{
                display: 'inline-block',
                background: '#2563eb',
                color: 'white',
                padding: '11px 22px',
                borderRadius: '8px',
                textDecoration: 'none',
                fontWeight: '700',
              }}
            >
              ← Back to Website
            </a>
          </div>

        </section>

        {/* FOOTER */}
        <footer
          style={{
            textAlign: 'center',
            padding: '18px 10px',
            color: '#6b7280',
            fontSize: '13px',
          }}
        >
          © 2026 SR E-Print Online. All Rights Reserved.
        </footer>

      </div>
    </main>
  );
}
