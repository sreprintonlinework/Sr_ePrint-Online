'use client';

import { useState, useRef } from 'react';
import { pdfs } from '../pdfs';

export default function Home() {
  const [selectedPdf, setSelectedPdf] =
    useState(null);

  const [search, setSearch] =
    useState('');

  const [loading, setLoading] =
    useState(false);

  const [successMessage, setSuccessMessage] =
    useState('');

  const [pdfUrl, setPdfUrl] =
    useState('');

  const paymentStartedRef =
    useRef(false);

  const downloadStartedRef =
    useRef(false);

  // ==========================================
  // FILTER FILES
  // ==========================================

  const filteredPdfs =
    pdfs.filter((pdf) =>
      pdf.name
        .toLowerCase()
        .includes(search.toLowerCase())
    );

  // ==========================================
  // GET FILE EXTENSION
  // ==========================================

  const getExtension = (fileName) => {
    const parts =
      fileName.split('.');

    return parts.length > 1
      ? '.' +
          parts[
            parts.length - 1
          ].toLowerCase()
      : '';
  };

  // ==========================================
  // LOAD RAZORPAY SCRIPT
  // ==========================================

  const loadRazorpayScript = () => {
    return new Promise(
      (resolve) => {
        if (
          typeof window ===
            'undefined'
        ) {
          resolve(false);
          return;
        }

        if (
          window.Razorpay
        ) {
          resolve(true);
          return;
        }

        const script =
          document.createElement(
            'script'
          );

        script.src =
          'https://checkout.razorpay.com/v1/checkout.js';

        script.onload = () =>
          resolve(true);

        script.onerror = () =>
          resolve(false);

        document.body.appendChild(
          script
        );
      }
    );
  };

  // ==========================================
  // PAYMENT
  // ==========================================

  const handlePayment = async () => {
    if (!selectedPdf) {
      alert(
        'Please select a file first.'
      );
      return;
    }

    if (
      paymentStartedRef.current
    ) {
      return;
    }

    paymentStartedRef.current =
      true;

    downloadStartedRef.current =
      false;

    setLoading(true);
    setSuccessMessage('');
    setPdfUrl('');

    try {
      // ----------------------------------------
      // LOAD RAZORPAY
      // ----------------------------------------

      const razorpayLoaded =
        await loadRazorpayScript();

      if (!razorpayLoaded) {
        throw new Error(
          'Razorpay could not be loaded. Please check your internet connection.'
        );
      }

      // ----------------------------------------
      // CREATE ORDER
      // ----------------------------------------

      const orderResponse =
        await fetch(
          '/create-order',
          {
            method: 'POST',

            headers: {
              'Content-Type':
                'application/json',
            },

            body: JSON.stringify({
              pdfId:
                selectedPdf.id,
            }),
          }
        );

      const orderData =
        await orderResponse.json();

      if (
        !orderResponse.ok
      ) {
        throw new Error(
          orderData?.error ||
            'Unable to create payment order.'
        );
      }

      // ----------------------------------------
      // RAZORPAY KEY
      // ----------------------------------------

      const razorpayKey =
        process.env
          .NEXT_PUBLIC_RAZORPAY_KEY_ID;

      if (!razorpayKey) {
        throw new Error(
          'Razorpay public key is missing.'
        );
      }

      // ----------------------------------------
      // OPEN RAZORPAY
      // ----------------------------------------

      const options = {
        key: razorpayKey,

        amount:
          orderData.amount,

        currency:
          orderData.currency ||
          'INR',

        name:
          'SR INTERNET Online Centre',

        description:
          `Digital File - ${selectedPdf.name}`,

        order_id:
          orderData.orderId,

        theme: {
          color: '#2563eb',
        },

        handler:
          async function (
            response
          ) {
            if (
              downloadStartedRef.current
            ) {
              return;
            }

            downloadStartedRef.current =
              true;

            try {
              // --------------------------------
              // VERIFY PAYMENT
              // --------------------------------

              const verifyResponse =
                await fetch(
                  '/verify-payment',
                  {
                    method: 'POST',

                    headers: {
                      'Content-Type':
                        'application/json',
                    },

                    body:
                      JSON.stringify({
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

              // --------------------------------
              // CHECK RESPONSE
              // --------------------------------

              if (
                !verifyResponse.ok
              ) {
                let errorMessage =
                  'Payment verification failed.';

                try {
                  const errorData =
                    await verifyResponse.json();

                  errorMessage =
                    errorData?.error ||
                    errorMessage;
                } catch {
                  // ignore JSON error
                }

                throw new Error(
                  errorMessage
                );
              }

              // --------------------------------
              // GET FILE BLOB
              // --------------------------------

              const blob =
                await verifyResponse.blob();

              if (
                !blob ||
                blob.size === 0
              ) {
                throw new Error(
                  'Downloaded file is empty.'
                );
              }

              // --------------------------------
              // CREATE OBJECT URL
              // --------------------------------

              const url =
                window.URL.createObjectURL(
                  blob
                );

              setPdfUrl(url);

              // --------------------------------
              // FILE EXTENSION
              // --------------------------------

              const extension =
                getExtension(
                  selectedPdf.file
                );

              const baseName =
                selectedPdf.file.replace(
                  /\.[^/.]+$/,
                  ''
                );

              const downloadFileName =
                `${baseName}-payment-${response.razorpay_payment_id}${extension}`;

              // --------------------------------
              // AUTO DOWNLOAD
              // --------------------------------

              const link =
                document.createElement(
                  'a'
                );

              link.href = url;

              link.download =
                downloadFileName;

              document.body.appendChild(
                link
              );

              link.click();

              link.remove();

              // --------------------------------
              // SUCCESS MESSAGE
              // --------------------------------

              setSuccessMessage(
                'Payment Successful! Your file download has started.'
              );

              setLoading(false);
            } catch (error) {
              console.error(
                'DOWNLOAD ERROR:',
                error
              );

              setSuccessMessage('');

              alert(
                error?.message ||
                  'Payment was received, but file download failed. Please contact support.'
              );

              setLoading(false);
            } finally {
              paymentStartedRef.current =
                false;
            }
          },

        modal: {
          ondismiss:
            function () {
              setLoading(false);

              paymentStartedRef.current =
                false;
            },
        },
      };

      const razorpay =
        new window.Razorpay(
          options
        );

      razorpay.on(
        'payment.failed',
        function (
          response
        ) {
          console.error(
            'Payment failed:',
            response
          );

          setLoading(false);

          paymentStartedRef.current =
            false;

          alert(
            response?.error
              ?.description ||
              'Payment failed. Please try again.'
          );
        }
      );

      razorpay.open();
    } catch (error) {
      console.error(
        'PAYMENT ERROR:',
        error
      );

      alert(
        error?.message ||
          'Something went wrong. Please try again.'
      );

      setLoading(false);

      paymentStartedRef.current =
        false;
    }
  };

  // ==========================================
  // FILE TYPE LABEL
  // ==========================================

  const getFileType = (
    fileName
  ) => {
    const extension =
      getExtension(fileName);

    switch (extension) {
      case '.pdf':
        return 'PDF';

      case '.xls':
        return 'Excel';

      case '.xlsx':
        return 'Excel';

      case '.doc':
        return 'Word';

      case '.docx':
        return 'Word';

      default:
        return 'File';
    }
  };

  return (
    <main
      style={{
        minHeight: '100vh',
        background:
          '#f3f6fb',
        fontFamily:
          'Arial, sans-serif',
      }}
    >
      {/* ========================================
          HEADER
      ======================================== */}

      <header
        style={{
          background:
            'linear-gradient(135deg, #2563eb, #1d4ed8)',
          color: 'white',
          padding:
            '30px 20px',
          textAlign: 'center',
        }}
      >
        <h1
          style={{
            margin: 0,
            fontSize:
              '32px',
            fontWeight:
              '700',
          }}
        >
          SR INTERNET Online Centre
        </h1>

        <p
          style={{
            marginTop:
              '8px',
            marginBottom: 0,
            fontSize:
              '17px',
          }}
        >
          Digital PDF & Online Services
        </p>
      </header>

      {/* ========================================
          CONTENT
      ======================================== */}

      <div
        style={{
          maxWidth:
            '900px',
          margin:
            '0 auto',
          padding:
            '25px 15px 50px',
        }}
      >
        {/* INTRO */}

        <section
          style={{
            background:
              'white',
            borderRadius:
              '14px',
            padding:
              '25px',
            marginBottom:
              '20px',
            boxShadow:
              '0 4px 15px rgba(0,0,0,0.08)',
          }}
        >
          <h2
            style={{
              marginTop: 0,
              color:
                '#1e3a8a',
            }}
          >
            Online Digital Documents
          </h2>

          <p
            style={{
              lineHeight:
                '1.7',
              color:
                '#374151',
            }}
          >
            Select the required file,
            make a secure online payment,
            and download your file instantly.
          </p>

          <p
            style={{
              marginBottom: 0,
              color:
                '#059669',
              fontWeight:
                '600',
            }}
          >
            PDF, Excel and other digital files available.
          </p>
        </section>

        {/* SEARCH */}

        <section
          style={{
            marginBottom:
              '20px',
          }}
        >
          <input
            type="text"
            placeholder="🔍 Search PDF / Excel file..."
            value={search}
            onChange={(e) =>
              setSearch(
                e.target.value
              )
            }
            style={{
              width:
                '100%',
              boxSizing:
                'border-box',
              padding:
                '15px',
              borderRadius:
                '10px',
              border:
                '1px solid #cbd5e1',
              fontSize:
                '16px',
              outline:
                'none',
            }}
          />
        </section>

        {/* AVAILABLE FILES */}

        <section
          style={{
            background:
              '#dcfce7',
            borderRadius:
              '14px',
            padding:
              '20px',
            marginBottom:
              '20px',
          }}
        >
          <h2
            style={{
              marginTop: 0,
              color:
                '#166534',
            }}
          >
            Available Files
          </h2>

          {filteredPdfs.length ===
          0 ? (
            <p>
              No files found.
            </p>
          ) : (
            filteredPdfs.map(
              (pdf) => (
                <div
                  key={pdf.id}
                  onClick={() => {
                    setSelectedPdf(
                      pdf
                    );
                    setSuccessMessage(
                      ''
                    );
                    setPdfUrl('');
                  }}
                  style={{
                    background:
                      selectedPdf?.id ===
                      pdf.id
                        ? '#bbf7d0'
                        : 'white',

                    border:
                      selectedPdf?.id ===
                      pdf.id
                        ? '2px solid #16a34a'
                        : '1px solid #d1d5db',

                    borderRadius:
                      '10px',

                    padding:
                      '15px',

                    marginBottom:
                      '10px',

                    cursor:
                      'pointer',

                    display:
                      'flex',

                    justifyContent:
                      'space-between',

                    alignItems:
                      'center',

                    gap:
                      '10px',
                  }}
                >
                  <div>
                    <strong>
                      {pdf.name}
                    </strong>

                    <div
                      style={{
                        marginTop:
                          '5px',
                        fontSize:
                          '13px',
                        color:
                          '#6b7280',
                      }}
                    >
                      {getFileType(
                        pdf.file
                      )}{' '}
                      •{' '}
                      {pdf.file}
                    </div>
                  </div>

                  <strong
                    style={{
                      color:
                        '#166534',
                      whiteSpace:
                        'nowrap',
                    }}
                  >
                    ₹{pdf.price}
                  </strong>
                </div>
              )
            )
          )}
        </section>

        {/* SELECTED FILE */}

        {selectedPdf && (
          <section
            style={{
              background:
                'white',
              borderRadius:
                '14px',
              padding:
                '25px',
              marginBottom:
                '20px',
              boxShadow:
                '0 4px 15px rgba(0,0,0,0.08)',
              textAlign:
                'center',
            }}
          >
            <h2
              style={{
                marginTop: 0,
                color:
                  '#1e3a8a',
              }}
            >
              {selectedPdf.name}
            </h2>

            <p
              style={{
                color:
                  '#6b7280',
              }}
            >
              File:{' '}
              {selectedPdf.file}
            </p>

            <div
              style={{
                fontSize:
                  '28px',
                fontWeight:
                  '700',
                color:
                  '#059669',
                margin:
                  '15px 0',
              }}
            >
              ₹{selectedPdf.price}
            </div>

            <button
              onClick={
                handlePayment
              }
              disabled={
                loading
              }
              style={{
                width:
                  '100%',
                maxWidth:
                  '450px',
                padding:
                  '15px',
                border: 'none',
                borderRadius:
                  '10px',
                background:
                  loading
                    ? '#9ca3af'
                    : '#2563eb',
                color:
                  'white',
                fontSize:
                  '17px',
                fontWeight:
                  '700',
                cursor:
                  loading
                    ? 'not-allowed'
                    : 'pointer',
              }}
            >
              {loading
                ? '⏳ Processing Payment...'
                : `💳 Pay ₹${selectedPdf.price} & Download`}
            </button>

            {/* SUCCESS */}

            {successMessage && (
              <div
                style={{
                  marginTop:
                    '20px',
                  padding:
                    '15px',
                  background:
                    '#dcfce7',
                  color:
                    '#166534',
                  borderRadius:
                    '10px',
                  fontWeight:
                    '600',
                }}
              >
                {successMessage}
              </div>
            )}

            {/* OPEN FILE */}

            {pdfUrl && (
              <div
                style={{
                  marginTop:
                    '15px',
                }}
              >
                <a
                  href={pdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display:
                      'inline-block',
                    padding:
                      '12px 20px',
                    borderRadius:
                      '8px',
                    background:
                      '#16a34a',
                    color:
                      'white',
                    textDecoration:
                      'none',
                    fontWeight:
                      '700',
                  }}
                >
                  📄 Open File
                </a>
              </div>
            )}
          </section>
        )}

        {/* ABOUT */}

        <section
          style={{
            background:
              'white',
            borderRadius:
              '14px',
            padding:
              '25px',
            marginBottom:
              '20px',
          }}
        >
          <h2
            style={{
              color:
                '#1e3a8a',
            }}
          >
            About
          </h2>

          <p
            style={{
              lineHeight:
                '1.7',
              color:
                '#374151',
            }}
          >
            SR E-Print Online provides
            digital documents and online
            services through secure online
            payment and digital delivery.
          </p>
        </section>

        {/* SERVICES */}

        <section
          style={{
            background:
              'white',
            borderRadius:
              '14px',
            padding:
              '25px',
            marginBottom:
              '20px',
          }}
        >
          <h2
            style={{
              color:
                '#1e3a8a',
            }}
          >
            Services
          </h2>

          <ul
            style={{
              lineHeight:
                '2',
              color:
                '#374151',
            }}
          >
            <li>
              Digital PDF Documents
            </li>
            <li>
              Excel Files
            </li>
            <li>
              Online Document Services
            </li>
            <li>
              Secure Online Payment
            </li>
            <li>
              Instant Digital Delivery
            </li>
          </ul>
        </section>

        {/* HOW IT WORKS */}

        <section
          style={{
            background:
              'white',
            borderRadius:
              '14px',
            padding:
              '25px',
            marginBottom:
              '20px',
          }}
        >
          <h2
            style={{
              color:
                '#1e3a8a',
            }}
          >
            How It Works
          </h2>

          <ol
            style={{
              lineHeight:
                '2',
              color:
                '#374151',
            }}
          >
            <li>
              Select the required file.
            </li>

            <li>
              Click the payment button.
            </li>

            <li>
              Complete Razorpay payment.
            </li>

            <li>
              Payment is securely verified.
            </li>

            <li>
              Your file starts downloading automatically.
            </li>
          </ol>
        </section>

        {/* PAYMENT & DELIVERY */}

        <section
          style={{
            background:
              'white',
            borderRadius:
              '14px',
            padding:
              '25px',
            marginBottom:
              '20px',
          }}
        >
          <h2
            style={{
              color:
                '#1e3a8a',
            }}
          >
            Payment & Digital Delivery
          </h2>

          <p
            style={{
              lineHeight:
                '1.7',
              color:
                '#374151',
            }}
          >
            Payments are processed securely
            through Razorpay. After successful
            payment verification, the selected
            digital file is delivered
            automatically.
          </p>

          <p
            style={{
              lineHeight:
                '1.7',
              color:
                '#374151',
            }}
          >
            No physical shipping is involved.
            All products are digital files.
          </p>
        </section>

        {/* CONTACT */}

        <section
          style={{
            background:
              'white',
            borderRadius:
              '14px',
            padding:
              '25px',
            marginBottom:
              '20px',
          }}
        >
          <h2
            style={{
              color:
                '#1e3a8a',
            }}
          >
            Contact
          </h2>

          <p
            style={{
              lineHeight:
                '1.8',
              color:
                '#374151',
            }}
          >
            <strong>
              SR E-Print Online
            </strong>
            <br />
            WhatsApp / Phone:
            9989057683
            <br />
            Email:
            sronline99890@gmail.com
          </p>
        </section>

        {/* FOOTER */}

        <footer
          style={{
            textAlign:
              'center',
            padding:
              '20px',
            color:
              '#6b7280',
            fontSize:
              '14px',
          }}
        >
          © 2026 SR E-Print Online.
          All Rights Reserved.
        </footer>
      </div>

      {/* WHATSAPP */}

      <a
        href="https://wa.me/919989057683"
        target="_blank"
        rel="noopener noreferrer"
        style={{
          position:
            'fixed',
          right:
            '20px',
          bottom:
            '20px',
          width:
            '55px',
          height:
            '55px',
          borderRadius:
            '50%',
          background:
            '#25D366',
          color:
            'white',
          display:
            'flex',
          alignItems:
            'center',
          justifyContent:
            'center',
          textDecoration:
            'none',
          fontSize:
            '28px',
          boxShadow:
            '0 4px 12px rgba(0,0,0,0.25)',
          zIndex:
            1000,
        }}
        aria-label="WhatsApp"
      >
        ☎
      </a>
    </main>
  );
}
