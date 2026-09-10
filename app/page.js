'use client';

import { useState, useRef } from 'react';
import Script from 'next/script';
import { pdfs } from './pdfs';

export default function Home() {
  const [selectedPdf, setSelectedPdf] = useState(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [pdfUrl, setPdfUrl] = useState('');

  const paymentStartedRef = useRef(false);
  const downloadStartedRef = useRef(false);

  // ==========================================
  // A-Z SORT + SEARCH
  // ==========================================

  const sortedPdfs = [...pdfs].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, {
      sensitivity: 'base',
    })
  );

  const filteredPdfs = sortedPdfs.filter((pdf) =>
    pdf.name.toLowerCase().includes(search.toLowerCase())
  );

  // ==========================================
  // SELECT PDF
  // ==========================================

  const selectPdf = (pdf) => {
    setSelectedPdf(pdf);
    setSuccessMessage('');
    setPdfUrl('');
    paymentStartedRef.current = false;
    downloadStartedRef.current = false;
  };

  // ==========================================
  // DOWNLOAD PDF
  // ==========================================

  const startDownload = (url, fileName) => {
    if (!url || downloadStartedRef.current) return;

    downloadStartedRef.current = true;

    try {
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName || 'download.pdf';
      link.target = '_blank';
      link.rel = 'noopener noreferrer';

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error('Download error:', error);
    }
  };

  // ==========================================
  // PAYMENT
  // ==========================================

  const handlePayment = async () => {
    if (!selectedPdf) {
      alert('Please select a file first.');
      return;
    }

    if (loading || paymentStartedRef.current) return;

    paymentStartedRef.current = true;
    setLoading(true);
    setSuccessMessage('');
    setPdfUrl('');

    try {
      // ----------------------------------------
      // CREATE RAZORPAY ORDER
      // ----------------------------------------

      const orderResponse = await fetch('/create-order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          pdfId: selectedPdf.id,
        }),
      });

      const orderText = await orderResponse.text();

      let orderData;

      try {
        orderData = JSON.parse(orderText);
      } catch (error) {
        console.error('Create order response:', orderText);
        throw new Error(
          'Server returned an invalid response. Please try again.'
        );
      }

      if (!orderResponse.ok || !orderData.success) {
        throw new Error(
          orderData.error || 'Unable to create payment order.'
        );
      }

      // ----------------------------------------
      // RAZORPAY CHECKOUT
      // ----------------------------------------

      if (!window.Razorpay) {
        throw new Error(
          'Razorpay is still loading. Please wait a few seconds and try again.'
        );
      }

      const options = {
        key: orderData.keyId,
        amount: orderData.amount,
        currency: orderData.currency || 'INR',
        name: 'SR INTERNET Online Centre',
        description: selectedPdf.name,
        order_id: orderData.orderId,

        theme: {
          color: '#2563eb',
        },

        handler: async function (response) {
          try {
            // ----------------------------------
            // VERIFY PAYMENT
            // ----------------------------------

            const verifyResponse = await fetch('/verify-payment', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                pdfId: selectedPdf.id,
              }),
            });

            const verifyText = await verifyResponse.text();

            let verifyData;

            try {
              verifyData = JSON.parse(verifyText);
            } catch (error) {
              console.error('Verify response:', verifyText);
              throw new Error(
                'Payment verification returned an invalid response.'
              );
            }

            if (!verifyResponse.ok || !verifyData.success) {
              throw new Error(
                verifyData.error || 'Payment verification failed.'
              );
            }

            // ----------------------------------
            // PAYMENT SUCCESS
            // ----------------------------------

            setSuccessMessage(
              'Payment Successful! Your PDF download has started.'
            );

            if (verifyData.pdfUrl) {
              setPdfUrl(verifyData.pdfUrl);

              // Small delay helps browser handle the download
              setTimeout(() => {
                startDownload(
                  verifyData.pdfUrl,
                  selectedPdf.file
                );
              }, 300);
            } else {
              throw new Error(
                'Payment successful, but PDF link was not received.'
              );
            }
          } catch (error) {
            console.error('Verification error:', error);

            setSuccessMessage('');
            alert(
              'Payment was received, but PDF download failed.\n\n' +
                (error.message || 'Please contact us.')
            );
          } finally {
            setLoading(false);
            paymentStartedRef.current = false;
          }
        },

        modal: {
          ondismiss: function () {
            setLoading(false);
            paymentStartedRef.current = false;
          },
        },
      };

      const razorpay = new window.Razorpay(options);

      razorpay.on('payment.failed', function (response) {
        console.error('Payment failed:', response.error);

        setLoading(false);
        paymentStartedRef.current = false;

        alert(
          response.error?.description ||
            'Payment failed. Please try again.'
        );
      });

      razorpay.open();
    } catch (error) {
      console.error('Payment error:', error);

      setLoading(false);
      paymentStartedRef.current = false;

      alert(error.message || 'Something went wrong.');
    }
  };

  return (
    <>
      {/* ========================================
          RAZORPAY SCRIPT
      ========================================= */}

      <Script
        src="https://checkout.razorpay.com/v1/checkout.js"
        strategy="afterInteractive"
      />

      {/* ========================================
          PAGE
      ========================================= */}

      <main
        style={{
          minHeight: '100vh',
          background: '#f8fafc',
          paddingBottom: '40px',
        }}
      >
        {/* ======================================
            HEADER
        ====================================== */}

        <header
          style={{
            background:
              'linear-gradient(135deg, #1d4ed8, #2563eb)',
            color: 'white',
            padding: '28px 16px',
            textAlign: 'center',
          }}
        >
          <h1
            style={{
              margin: 0,
              fontSize: '28px',
              fontWeight: '800',
            }}
          >
            SR INTERNET Online Centre
          </h1>

          <p
            style={{
              margin: '8px 0 0',
              fontSize: '16px',
            }}
          >
            Digital PDF & Online Services
          </p>
        </header>

        {/* ======================================
            MAIN CONTENT
        ====================================== */}

        <div
          style={{
            maxWidth: '1000px',
            margin: '0 auto',
            padding: '20px 14px',
          }}
        >
          {/* INTRO */}

          <section
            style={{
              background: 'white',
              borderRadius: '14px',
              padding: '20px',
              marginBottom: '18px',
              boxShadow: '0 2px 10px rgba(0,0,0,0.06)',
            }}
          >
            <h2
              style={{
                marginTop: 0,
                color: '#0f172a',
                fontSize: '22px',
              }}
            >
              Online Digital Documents
            </h2>

            <p
              style={{
                color: '#475569',
                lineHeight: 1.6,
                marginBottom: 0,
              }}
            >
              Select the required file, make a secure online
              payment, and download your file instantly.
            </p>
          </section>

          {/* ====================================
              SEARCH
          ==================================== */}

          <section
            style={{
              marginBottom: '18px',
            }}
          >
            <input
              type="text"
              placeholder="Search files..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '14px 16px',
                borderRadius: '10px',
                border: '1px solid #cbd5e1',
                fontSize: '16px',
                outline: 'none',
                background: 'white',
              }}
            />
          </section>

          {/* ====================================
              AVAILABLE FILES
              2 COLUMNS
              A-Z ORDER
          ==================================== */}

          <section>
            <h2
              style={{
                color: '#0f172a',
                fontSize: '22px',
                marginBottom: '14px',
              }}
            >
              Available Files
            </h2>

            {filteredPdfs.length === 0 ? (
              <div
                style={{
                  background: 'white',
                  padding: '25px',
                  borderRadius: '12px',
                  textAlign: 'center',
                  color: '#64748b',
                }}
              >
                No files found.
              </div>
            ) : (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns:
                    'repeat(2, minmax(0, 1fr))',
                  gap: '12px',
                }}
              >
                {filteredPdfs.map((pdf) => (
                  <div
                    key={pdf.id}
                    onClick={() => selectPdf(pdf)}
                    style={{
                      background:
                        selectedPdf?.id === pdf.id
                          ? '#dbeafe'
                          : '#ecfdf5',

                      border:
                        selectedPdf?.id === pdf.id
                          ? '2px solid #2563eb'
                          : '1px solid #bbf7d0',

                      borderRadius: '12px',
                      padding: '14px',
                      cursor: 'pointer',
                      transition: '0.2s',
                    }}
                  >
                    <div
                      style={{
                        fontWeight: '800',
                        color: '#0f172a',
                        fontSize: '16px',
                        marginBottom: '6px',
                        wordBreak: 'break-word',
                      }}
                    >
                      {pdf.name}
                    </div>

                    <div
                      style={{
                        color: '#64748b',
                        fontSize: '13px',
                        marginBottom: '8px',
                        wordBreak: 'break-word',
                      }}
                    >
                      PDF • {pdf.file}
                    </div>

                    <div
                      style={{
                        fontWeight: '800',
                        color: '#166534',
                        fontSize: '17px',
                      }}
                    >
                      ₹{pdf.price}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* ====================================
              SELECTED FILE + PAYMENT
          ==================================== */}

          {selectedPdf && (
            <section
              style={{
                marginTop: '20px',
                background: 'white',
                borderRadius: '14px',
                padding: '20px',
                boxShadow: '0 2px 10px rgba(0,0,0,0.08)',
                border: '1px solid #e2e8f0',
              }}
            >
              <h2
                style={{
                  marginTop: 0,
                  color: '#0f172a',
                  fontSize: '20px',
                }}
              >
                Selected File
              </h2>

              <p
                style={{
                  margin: '8px 0',
                  fontWeight: '700',
                  color: '#334155',
                }}
              >
                {selectedPdf.name}
              </p>

              <p
                style={{
                  margin: '8px 0 16px',
                  fontSize: '20px',
                  fontWeight: '800',
                  color: '#166534',
                }}
              >
                ₹{selectedPdf.price}
              </p>

              <button
                onClick={handlePayment}
                disabled={loading}
                style={{
                  width: '100%',
                  padding: '14px',
                  border: 'none',
                  borderRadius: '10px',
                  background: loading
                    ? '#94a3b8'
                    : '#2563eb',
                  color: 'white',
                  fontSize: '17px',
                  fontWeight: '800',
                  cursor: loading
                    ? 'not-allowed'
                    : 'pointer',
                }}
              >
                {loading
                  ? 'Processing...'
                  : `Pay ₹${selectedPdf.price} & Download`}
              </button>

              {/* ==================================
                  SUCCESS MESSAGE
              ================================== */}

              {successMessage && (
                <div
                  style={{
                    marginTop: '16px',
                    padding: '14px',
                    borderRadius: '10px',
                    background: '#dcfce7',
                    color: '#166534',
                    fontWeight: '700',
                    textAlign: 'center',
                  }}
                >
                  ✅ {successMessage}
                </div>
              )}

              {/* ==================================
                  OPEN PDF BUTTON
              ================================== */}

              {pdfUrl && (
                <a
                  href={pdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'block',
                    marginTop: '12px',
                    textAlign: 'center',
                    padding: '13px',
                    borderRadius: '10px',
                    background: '#16a34a',
                    color: 'white',
                    textDecoration: 'none',
                    fontWeight: '800',
                  }}
                >
                  📄 Open PDF
                </a>
              )}
            </section>
          )}

          {/* ====================================
              ABOUT
          ==================================== */}

          <section
            style={{
              background: 'white',
              borderRadius: '14px',
              padding: '20px',
              marginTop: '20px',
            }}
          >
            <h2
              style={{
                color: '#0f172a',
                marginTop: 0,
              }}
            >
              About SR E-Print Online
            </h2>

            <p
              style={{
                color: '#475569',
                lineHeight: 1.7,
              }}
            >
              SR E-Print Online provides digital PDF and online
              services. Customers can select required digital
              files, make secure online payments and receive
              their files digitally.
            </p>

            <p
              style={{
                color: '#475569',
                lineHeight: 1.7,
              }}
            >
              No physical shipping is provided. All products
              are delivered digitally.
            </p>
          </section>

          {/* ====================================
              SERVICES
          ==================================== */}

          <section
            style={{
              background: 'white',
              borderRadius: '14px',
              padding: '20px',
              marginTop: '16px',
            }}
          >
            <h2
              style={{
                color: '#0f172a',
                marginTop: 0,
              }}
            >
              Services
            </h2>

            <ul
              style={{
                color: '#475569',
                lineHeight: 1.9,
                paddingLeft: '20px',
              }}
            >
              <li>Digital PDF Documents</li>
              <li>Online Document Services</li>
              <li>Digital File Delivery</li>
              <li>PDF and Online Support Services</li>
            </ul>
          </section>

          {/* ====================================
              HOW IT WORKS
          ==================================== */}

          <section
            style={{
              background: 'white',
              borderRadius: '14px',
              padding: '20px',
              marginTop: '16px',
            }}
          >
            <h2
              style={{
                color: '#0f172a',
                marginTop: 0,
              }}
            >
              How It Works
            </h2>

            <ol
              style={{
                color: '#475569',
                lineHeight: 1.9,
                paddingLeft: '20px',
              }}
            >
              <li>Select your required file.</li>
              <li>Click Pay & Download.</li>
              <li>Complete secure Razorpay payment.</li>
              <li>Payment is verified securely.</li>
              <li>Your PDF download starts automatically.</li>
              <li>You can also use the Open PDF button.</li>
            </ol>
          </section>

          {/* ====================================
              PAYMENT & DELIVERY
          ==================================== */}

          <section
            style={{
              background: 'white',
              borderRadius: '14px',
              padding: '20px',
              marginTop: '16px',
            }}
          >
            <h2
              style={{
                color: '#0f172a',
                marginTop: 0,
              }}
            >
              Payment & Digital Delivery
            </h2>

            <p
              style={{
                color: '#475569',
                lineHeight: 1.7,
              }}
            >
              Payments are securely processed through
              Razorpay. After successful payment verification,
              the purchased digital file is provided for
              download.
            </p>

            <p
              style={{
                color: '#475569',
                lineHeight: 1.7,
              }}
            >
              Since the products are digital files, there is no
              physical delivery or shipping.
            </p>
          </section>

          {/* ====================================
              CONTACT
          ==================================== */}

          <section
            style={{
              background: 'white',
              borderRadius: '14px',
              padding: '20px',
              marginTop: '16px',
            }}
          >
            <h2
              style={{
                color: '#0f172a',
                marginTop: 0,
              }}
            >
              Contact Us
            </h2>

            <p
              style={{
                color: '#475569',
                lineHeight: 1.8,
                marginBottom: 0,
              }}
            >
              <strong>Business:</strong> SR E-Print Online
              <br />

              <strong>Contact Person:</strong> Gs Raju
              <br />

              <strong>Phone / WhatsApp:</strong> 9989057683
              <br />

              <strong>Email:</strong> sronline99890@gmail.com
              <br />

              <strong>Address:</strong>
              <br />
              Sr internet online center, New Maa Mart backside,
              Kurnool Road, Ieeja, Jogulamba Gadwal,
              Telangana - 509127
            </p>
          </section>

          {/* ====================================
              POLICY LINKS
          ==================================== */}

          <section
            style={{
              textAlign: 'center',
              marginTop: '24px',
              paddingBottom: '10px',
            }}
          >
            <a
              href="/privacy"
              style={{
                margin: '0 8px',
                color: '#2563eb',
                textDecoration: 'none',
              }}
            >
              Privacy Policy
            </a>

            <a
              href="/refund"
              style={{
                margin: '0 8px',
                color: '#2563eb',
                textDecoration: 'none',
              }}
            >
              Refund Policy
            </a>

            <a
              href="/terms"
              style={{
                margin: '0 8px',
                color: '#2563eb',
                textDecoration: 'none',
              }}
            >
              Terms & Conditions
            </a>

            <a
              href="/payment-history"
              style={{
                margin: '0 8px',
                color: '#2563eb',
                textDecoration: 'none',
              }}
            >
              Payment History
            </a>
          </section>

          {/* ====================================
              FOOTER
          ==================================== */}

          <footer
            style={{
              textAlign: 'center',
              color: '#64748b',
              fontSize: '13px',
              marginTop: '10px',
            }}
          >
            © {new Date().getFullYear()} SR E-Print Online.
            All rights reserved.
          </footer>
        </div>
      </main>
    </>
  );
}
