'use client';

import { useState, useRef } from 'react';
import { pdfs } from './pdfs';

export default function Home() {
  const [selectedPdf, setSelectedPdf] = useState(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [pdfUrl, setPdfUrl] = useState('');

  const paymentStartedRef = useRef(false);
  const downloadStartedRef = useRef(false);

  // ------------------------------------
  // LOAD RAZORPAY
  // ------------------------------------

  const loadRazorpayScript = () => {
    return new Promise((resolve) => {
      if (window.Razorpay) {
        resolve(true);
        return;
      }

      const script = document.createElement('script');

      script.src =
        'https://checkout.razorpay.com/v1/checkout.js';

      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);

      document.body.appendChild(script);
    });
  };

  // ------------------------------------
  // PAYMENT
  // ------------------------------------

  const handlePayment = async () => {
    if (!selectedPdf) {
      alert('Please select a PDF first.');
      return;
    }

    if (paymentStartedRef.current) {
      return;
    }

    paymentStartedRef.current = true;
    downloadStartedRef.current = false;

    setLoading(true);

    // IMPORTANT:
    // Clear old success state before starting payment
    setSuccessMessage('');
    setPdfUrl('');

    try {
      // LOAD RAZORPAY
      const razorpayLoaded =
        await loadRazorpayScript();

      if (!razorpayLoaded) {
        throw new Error(
          'Razorpay SDK failed to load.'
        );
      }

      // CREATE ORDER
      const orderRes = await fetch(
        '/create-order',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            pdfId: selectedPdf.id,
          }),
        }
      );

      let orderData;

      try {
        orderData = await orderRes.json();
      } catch {
        throw new Error(
          'Server returned an invalid response. Please try again.'
        );
      }

      if (!orderRes.ok) {
        throw new Error(
          orderData?.error ||
          'Failed to create payment order'
        );
      }

      if (!orderData?.orderId) {
        throw new Error(
          'Razorpay Order ID not received'
        );
      }

      // RAZORPAY PUBLIC KEY
      const razorpayKey =
        process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;

      if (!razorpayKey) {
        throw new Error(
          'Razorpay Key ID is missing. Please check Vercel Environment Variables.'
        );
      }

      // ------------------------------------
      // RAZORPAY OPTIONS
      // ------------------------------------

      const options = {
        key: razorpayKey,

        amount:
          orderData.amount || 9900,

        currency:
          orderData.currency || 'INR',

        name:
          'SR INTERNET Online Centre',

        description:
          `Digital PDF - ${selectedPdf.name}`,

        order_id:
          orderData.orderId,

        // --------------------------------
        // PAYMENT SUCCESS
        // --------------------------------

        handler: async function (response) {
          try {
            if (downloadStartedRef.current) {
              return;
            }

            // VERIFY PAYMENT
            const verifyRes =
              await fetch(
                '/verify-payment',
                {
                  method: 'POST',

                  headers: {
                    'Content-Type':
                      'application/json',
                  },

                  body: JSON.stringify({
                    razorpay_order_id:
                      response.razorpay_order_id,

                    razorpay_payment_id:
                      response.razorpay_payment_id,

                    razorpay_signature:
                      response.razorpay_signature,

                    pdfId:
                      selectedPdf.id,
                  }),
                }
              );

            if (!verifyRes.ok) {
              let errorMessage =
                'Payment verification failed';

              try {
                const errorData =
                  await verifyRes.json();

                errorMessage =
                  errorData?.error ||
                  errorMessage;
              } catch {
                errorMessage =
                  'Payment verification failed.';
              }

              throw new Error(
                errorMessage
              );
            }

            // GET PDF
            const blob =
              await verifyRes.blob();

            if (
              !blob ||
              blob.size === 0
            ) {
              throw new Error(
                'PDF file is empty'
              );
            }

            // --------------------------------
            // PREVENT DUPLICATE DOWNLOAD
            // --------------------------------

            downloadStartedRef.current = true;

            // --------------------------------
            // CREATE PDF URL
            // --------------------------------

            const url =
              window.URL.createObjectURL(
                blob
              );

            setPdfUrl(url);

            // --------------------------------
            // UNIQUE FILE NAME
            // --------------------------------

            const originalName =
              selectedPdf.file;

            const dotIndex =
              originalName.lastIndexOf('.');

            let baseName =
              originalName;

            let extension =
              '.pdf';

            if (dotIndex > 0) {
              baseName =
                originalName.substring(
                  0,
                  dotIndex
                );

              extension =
                originalName.substring(
                  dotIndex
                );
            }

            const uniqueFileName =
              `${baseName}-payment-${response.razorpay_payment_id}${extension}`;

            // --------------------------------
            // AUTOMATIC DOWNLOAD
            // --------------------------------

            const link =
              document.createElement('a');

            link.href = url;

            link.download =
              uniqueFileName;

            link.style.display =
              'none';

            document.body.appendChild(
              link
            );

            link.click();

            document.body.removeChild(
              link
            );

            // --------------------------------
            // SUCCESS MESSAGE
            // --------------------------------

            setSuccessMessage(
              '✅ Payment Successful! Your PDF download has started.'
            );

          } catch (error) {
            console.error(
              'Payment verification/download error:',
              error
            );

            downloadStartedRef.current =
              false;

            alert(
              'Payment was received, but PDF download failed. Please contact support.'
            );
          } finally {
            setLoading(false);
            paymentStartedRef.current =
              false;
          }
        },

        // CUSTOMER DETAILS
        prefill: {
          name: '',
          email: '',
          contact: '',
        },

        // THEME
        theme: {
          color: '#1565c0',
        },

        // PAYMENT WINDOW CLOSED
        modal: {
          ondismiss: function () {
            setLoading(false);
            paymentStartedRef.current =
              false;
          },
        },
      };

      // OPEN RAZORPAY
      const razorpay =
        new window.Razorpay(options);

      // PAYMENT FAILED
      razorpay.on(
        'payment.failed',
        function (response) {
          console.error(
            'Razorpay payment failed:',
            response?.error
          );

          setLoading(false);

          paymentStartedRef.current =
            false;

          downloadStartedRef.current =
            false;

          alert(
            '❌ Payment failed. Please try again.'
          );
        }
      );

      razorpay.open();

    } catch (error) {
      console.error(
        'Payment error:',
        error
      );

      setLoading(false);

      paymentStartedRef.current =
        false;

      downloadStartedRef.current =
        false;

      alert(
        'Something went wrong: ' +
        error.message
      );
    }
  };

  // ------------------------------------
  // SEARCH
  // ------------------------------------

  const filteredPdfs =
    pdfs.filter((pdf) =>
      pdf.name
        .toLowerCase()
        .includes(
          search.toLowerCase()
        )
    );

  // ------------------------------------
  // PAGE
  // ------------------------------------

  return (
    <main
      style={{
        minHeight: '100vh',
        background: '#f4f7fb',
        fontFamily: 'Arial, sans-serif',
      }}
    >

      {/* HEADER */}

      <header
        style={{
          background: '#1565c0',
          color: 'white',
          padding: '24px 15px',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            maxWidth: '800px',
            margin: 'auto',
          }}
        >
          <div
            style={{
              fontSize: '42px',
            }}
          >
            📄
          </div>

          <h1
            style={{
              margin: '5px 0',
              fontSize: '30px',
            }}
          >
            SR INTERNET Online Centre
          </h1>

          <p
            style={{
              margin: '8px 0 0',
              fontSize: '16px',
              opacity: 0.95,
            }}
          >
            Digital PDF & Online Services
          </p>
        </div>
      </header>

      {/* MAIN */}

      <section
        style={{
          maxWidth: '800px',
          margin: '0 auto',
          padding: '25px 15px 40px',
        }}
      >

        {/* SUCCESS MESSAGE */}

        {successMessage && (
          <div
            style={{
              background: '#e8f5e9',
              border: '1px solid #81c784',
              color: '#2e7d32',
              padding: '15px',
              borderRadius: '12px',
              marginBottom: '20px',
              textAlign: 'center',
              fontWeight: 'bold',
              lineHeight: 1.5,
            }}
          >
            {successMessage}

            {pdfUrl && (
              <a
                href={pdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'block',
                  marginTop: '12px',
                  padding: '13px',
                  background: '#2e7d32',
                  color: 'white',
                  borderRadius: '10px',
                  textDecoration: 'none',
                  fontWeight: 'bold',
                }}
              >
                📄 Open PDF
              </a>
            )}
          </div>
        )}

        {/* INTRO */}

        <div
          style={{
            background: 'white',
            padding: '20px',
            borderRadius: '14px',
            marginBottom: '20px',
            textAlign: 'center',
            boxShadow:
              '0 3px 12px rgba(0,0,0,0.07)',
          }}
        >
          <h2
            style={{
              margin: '0 0 8px',
              color: '#222',
            }}
          >
            Online PDF Downloads
          </h2>

          <p
            style={{
              margin: 0,
              color: '#666',
              lineHeight: 1.6,
            }}
          >
            Select the required PDF,
            make a secure payment of ₹99,
            and download your PDF instantly.
          </p>
        </div>

        {/* SEARCH */}

        <input
          type="text"
          placeholder="🔎 Search PDF..."
          value={search}
          onChange={(e) =>
            setSearch(e.target.value)
          }
          style={{
            width: '80%',
            boxSizing: 'border-box',
            boxAlign: 'center',
            padding: '15px',
            fontSize: '18px',
            border: '1px solid #d5dbe3',
            borderRadius: '12px',
            outline: 'none',
            marginBottom: '15px',
            textAlign: 'center',
            background: '#FFE5B4',
          }}
        />

        {/* PDF LIST */}

        <div
          style={{
            background: 'white',
            borderRadius: '14px',
            padding: '10px',
            boxShadow:
              '0 3px 12px rgba(0,0,0,0.07)',
            marginBottom: '20px',
          }}
        >
          <h3
            style={{
              padding: '8px 10px',
              margin: '0 0 5px',
              color: '#222',
            }}
          >
            Available PDFs
          </h3>

          {filteredPdfs.length === 0 ? (

            <p
              style={{
                padding: '20px 10px',
                textAlign: 'center',
                color: '#777',
              }}
            >
              No PDF found.
            </p>

          ) : (

            filteredPdfs.map(
              (pdf) => (
                <div
                  key={pdf.id}
                  onClick={() => {
                    if (loading) return;

                    setSelectedPdf(pdf);
                    setSuccessMessage('');
                    setPdfUrl('');
                  }}
                  style={{
                    border:
                      selectedPdf?.id === pdf.id
                        ? '2px solid #1565c0'
                        : '1px solid #e1e5eb',

                    borderRadius: '12px',
                    padding: '15px',
                    marginBottom: '10px',

                    cursor:
                      loading
                        ? 'not-allowed'
                        : 'pointer',

                    background:
                      selectedPdf?.id === pdf.id
                        ? '#eef6ff'
                        : 'white',

                    transition: '0.2s',
                  }}
                >

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                    }}
                  >

                    <div
                      style={{
                        fontSize: '32px',
                      }}
                    >
                      📄
                    </div>

                    <div
                      style={{
                        flex: 1,
                      }}
                    >
                      <div
                        style={{
                          fontWeight: 'bold',
                          color: '#222',
                          fontSize: '16px',
                        }}
                      >
                        {pdf.name}
                      </div>

                      <div
                        style={{
                          color: '#777',
                          fontSize: '13px',
                          marginTop: '4px',
                        }}
                      >
                        PDF Document
                      </div>
                    </div>

                    <div
                      style={{
                        fontWeight: 'bold',
                        color: '#1565c0',
                      }}
                    >
                      ₹99
                    </div>

                  </div>
                </div>
              )
            )

          )}
        </div>

        {/* SELECTED PDF */}

        {selectedPdf && (
          <div
            style={{
              background: 'white',
              borderRadius: '14px',
              padding: '20px',
              marginTop: '20px',
              marginBottom: '20px',
              textAlign: 'center',
              boxShadow:
                '0 3px 12px rgba(0,0,0,0.07)',
            }}
          >

            <div
              style={{
                color: '#555',
                marginBottom: '8px',
              }}
            >
              Selected PDF
            </div>

            <h3
              style={{
                margin: '0 0 15px',
                color: '#222',
              }}
            >
              {selectedPdf.name}
            </h3>

            <div
              style={{
                fontSize: '24px',
                fontWeight: 'bold',
                color: '#1565c0',
                marginBottom: '15px',
              }}
            >
              ₹99
            </div>

            <button
              onClick={handlePayment}
              disabled={loading}
              style={{
                width: '100%',
                padding: '15px',
                border: 'none',
                borderRadius: '10px',

                background:
                  loading
                    ? '#999'
                    : '#1565c0',

                color: 'white',
                fontSize: '17px',
                fontWeight: 'bold',

                cursor:
                  loading
                    ? 'not-allowed'
                    : 'pointer',

                opacity:
                  loading ? 0.8 : 1,
              }}
            >
              {loading
                ? '⏳ Processing Payment...'
                : '💳 Pay ₹99 & Download PDF'}
            </button>

          </div>
        )}

        {/* ABOUT */}

        <div
          style={{
            background: 'white',
            padding: '20px',
            borderRadius: '14px',
            marginBottom: '20px',
            boxShadow:
              '0 3px 12px rgba(0,0,0,0.07)',
          }}
        >
          <h2
            style={{
              margin: '0 0 10px',
              color: '#222',
            }}
          >
            About SR E-Print Online
          </h2>

          <p
            style={{
              margin: '0 0 10px',
              color: '#555',
              lineHeight: 1.6,
            }}
          >
            SR E-Print Online is a digital
            document service platform that
            provides downloadable PDF and
            digital document files to
            customers online.
          </p>

          <p
            style={{
              margin: '0 0 10px',
              color: '#555',
              lineHeight: 1.6,
            }}
          >
            Customers can browse the
            available digital products,
            select the required file,
            make an online payment, and
            download the purchased digital
            file after successful payment.
          </p>

          <p
            style={{
              margin: 0,
              color: '#555',
              lineHeight: 1.6,
            }}
          >
            Our aim is to provide convenient
            and quick access to useful
            digital documents and printable
            files through an easy-to-use
            online platform.
          </p>
        </div>

        {/* SERVICES */}

        <div
          style={{
            background: 'white',
            padding: '20px',
            borderRadius: '14px',
            marginBottom: '20px',
            boxShadow:
              '0 3px 12px rgba(0,0,0,0.07)',
          }}
        >
          <h2
            style={{
              margin: '0 0 12px',
              color: '#222',
            }}
          >
            Our Services & Products
          </h2>

          <ul
            style={{
              margin: 0,
              paddingLeft: '22px',
              color: '#555',
              lineHeight: 1.9,
            }}
          >
            <li>Digital PDF documents</li>
            <li>Printable document files</li>
            <li>Ready-to-use document formats and templates</li>
            <li>Application and form-related digital files</li>
            <li>Educational and reference PDF materials</li>
            <li>Other digital document files available on our website</li>
          </ul>
        </div>

        {/* HOW IT WORKS */}

        <div
          style={{
            background: 'white',
            padding: '20px',
            borderRadius: '14px',
            marginBottom: '20px',
            boxShadow:
              '0 3px 12px rgba(0,0,0,0.07)',
          }}
        >
          <h2
            style={{
              margin: '0 0 12px',
              color: '#222',
            }}
          >
            How It Works
          </h2>

          <ol
            style={{
              margin: 0,
              paddingLeft: '22px',
              color: '#555',
              lineHeight: 1.9,
            }}
          >
            <li>Browse the available digital products.</li>
            <li>Select the required PDF or digital file.</li>
            <li>Proceed to online payment.</li>
            <li>Complete the payment using the available payment methods.</li>
            <li>After successful payment, download the purchased digital file.</li>
          </ol>

          <p
            style={{
              margin: '12px 0 0',
              color: '#555',
              lineHeight: 1.6,
            }}
          >
            Digital products are delivered electronically.
            No physical product is shipped.
          </p>
        </div>

        {/* PAYMENT & DELIVERY */}

        <div
          style={{
            background: 'white',
            padding: '20px',
            borderRadius: '14px',
            marginBottom: '20px',
            boxShadow:
              '0 3px 12px rgba(0,0,0,0.07)',
          }}
        >
          <h2
            style={{
              margin: '0 0 10px',
              color: '#222',
            }}
          >
            Payment & Digital Delivery
          </h2>

          <p
            style={{
              margin: '0 0 10px',
              color: '#555',
              lineHeight: 1.6,
            }}
          >
            We accept online payments through
            the payment methods available at checkout.
          </p>

          <p
            style={{
              margin: '0 0 10px',
              color: '#555',
              lineHeight: 1.6,
            }}
          >
            All prices displayed on the website
            are in Indian Rupees (INR).
          </p>

          <p
            style={{
              margin: 0,
              color: '#555',
              lineHeight: 1.6,
            }}
          >
            After successful payment, the purchased
            digital PDF/file is delivered electronically
            and can be downloaded by the customer.
            No physical product will be shipped.
          </p>
        </div>

        {/* CONTACT */}

        <div
          style={{
            background: 'white',
            padding: '20px',
            borderRadius: '14px',
            marginBottom: '20px',
            boxShadow:
              '0 3px 12px rgba(0,0,0,0.07)',
          }}
        >
          <h2
            style={{
              margin: '0 0 10px',
              color: '#222',
            }}
          >
            Contact Us
          </h2>

          <p
            style={{
              margin: '0 0 10px',
              color: '#555',
              lineHeight: 1.6,
            }}
          >
            For any questions, payment-related
            issues, or assistance with our digital
            products, please contact us.
          </p>

          <p style={{ margin: '6px 0', color: '#555' }}>
            <strong>Business Name:</strong>{' '}
            SR E-Print Online
          </p>

          <p style={{ margin: '6px 0', color: '#555' }}>
            <strong>Contact Person:</strong>{' '}
            Gs Raju
          </p>

          <p style={{ margin: '6px 0', color: '#555' }}>
            <strong>Email:</strong>{' '}
            <a
              href="mailto:sronline99890@gmail.com"
              style={{
                color: '#1565c0',
                textDecoration: 'none',
              }}
            >
              sronline99890@gmail.com
            </a>
          </p>

          <p style={{ margin: '6px 0', color: '#555' }}>
            <strong>Phone / WhatsApp:</strong>{' '}
            <a
              href="tel:+919989057683"
              style={{
                color: '#1565c0',
                textDecoration: 'none',
              }}
            >
              9989057683
            </a>
          </p>

          <p style={{ margin: '6px 0', color: '#555' }}>
            <strong>Business Hours:</strong>{' '}
            Monday to Saturday, 9:00 AM to 6:00 PM
          </p>
        </div>

        {/* FOOTER */}

        <footer
          style={{
            textAlign: 'center',
            marginTop: '30px',
            color: '#777',
            fontSize: '13px',
            paddingBottom: '20px',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              flexWrap: 'wrap',
              gap: '14px',
              marginBottom: '14px',
            }}
          >
            <a
              href="/privacy"
              style={{
                color: '#1565c0',
                textDecoration: 'none',
                fontWeight: 'bold',
              }}
            >
              Privacy Policy
            </a>

            <span>•</span>

            <a
              href="/refund"
              style={{
                color: '#1565c0',
                textDecoration: 'none',
                fontWeight: 'bold',
              }}
            >
              Refund / Cancellation
            </a>

            <span>•</span>

            <a
              href="/terms"
              style={{
                color: '#1565c0',
                textDecoration: 'none',
                fontWeight: 'bold',
              }}
            >
              Terms & Conditions
            </a>
          </div>

          <p>
            Secure payment powered by Razorpay
          </p>

          <p>
            © 2026 SR E-Print Online.
            All rights reserved.
          </p>
        </footer>

      </section>

      {/* ------------------------------------
          FLOATING WHATSAPP HELP BUTTON
          ------------------------------------ */}

      <a
        href="https://wa.me/919989057683?text=Hello%20SR%20E-Print%20Online,%20I%20need%20help%20regarding%20a%20PDF%20purchase."
        target="_blank"
        rel="noopener noreferrer"
        aria-label="WhatsApp Help"
        style={{
          position: 'fixed',
          right: '18px',
          bottom: '18px',
          width: '58px',
          height: '58px',
          borderRadius: '50%',
          background: '#25D366',
          color: 'white',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          textDecoration: 'none',
          fontSize: '30px',
          boxShadow:
            '0 4px 14px rgba(0,0,0,0.25)',
          zIndex: 9999,
        }}
      >
        💬
      </a>

    </main>
  );
}
