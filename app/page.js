'use client';

import { useState, useRef, useEffect } from 'react';
import { pdfs } from './pdfs';

export default function Home() {
  const [selectedPdf, setSelectedPdf] = useState(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [pdfUrl, setPdfUrl] = useState('');
  const [downloadFileName, setDownloadFileName] = useState('');

  const paymentStartedRef = useRef(false);
  const downloadStartedRef = useRef(false);

  useEffect(() => {
    document.body.style.backgroundColor = '#ffffff';

    return () => {
      document.body.style.backgroundColor = '';

      if (pdfUrl) {
        window.URL.revokeObjectURL(pdfUrl);
      }
    };
  }, [pdfUrl]);

  // A-Z sorting + Search
  const filteredPdfs = [...pdfs]
    .filter((pdf) =>
      pdf.name.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) =>
      a.name.localeCompare(b.name, undefined, {
        sensitivity: 'base',
      })
    );

  const getExtension = (fileName) => {
    if (!fileName) return '';

    const parts = fileName.split('.');

    if (parts.length < 2) return '';

    return '.' + parts[parts.length - 1].toLowerCase();
  };

  const getFileType = (fileName) => {
    const extension = getExtension(fileName);

    switch (extension) {
      case '.pdf':
        return 'PDF';

      case '.xls':
      case '.xlsx':
        return 'Excel';

      case '.doc':
      case '.docx':
        return 'Word';

      case '.jpg':
      case '.jpeg':
      case '.png':
        return 'Image';

      case '.txt':
        return 'Text';

      default:
        return 'Digital File';
    }
  };

  // Razorpay script
  const loadRazorpayScript = () => {
    return new Promise((resolve) => {
      if (typeof window === 'undefined') {
        resolve(false);
        return;
      }

      if (window.Razorpay) {
        resolve(true);
        return;
      }

      const scriptUrl =
        'https://checkout.razorpay.com/v1/checkout.js';

      const existingScript =
        document.querySelector(
          `script[src="${scriptUrl}"]`
        );

      if (existingScript) {
        existingScript.addEventListener(
          'load',
          () => resolve(true),
          { once: true }
        );

        existingScript.addEventListener(
          'error',
          () => resolve(false),
          { once: true }
        );

        return;
      }

      const script = document.createElement('script');

      script.src = scriptUrl;
      script.async = true;

      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);

      document.body.appendChild(script);
    });
  };

  // Select file
  const handleSelectFile = (pdf) => {
    setSelectedPdf(pdf);
    setSuccessMessage('');
    setDownloadFileName('');

    if (pdfUrl) {
      window.URL.revokeObjectURL(pdfUrl);
    }

    setPdfUrl('');

    downloadStartedRef.current = false;
  };

  /*
    IMPORTANT:
    Browser-friendly automatic download.
    This creates a temporary hidden link and
    triggers it immediately.
  */
  const startDownload = (url, fileName) => {
    try {
      const link = document.createElement('a');

      link.href = url;
      link.download = fileName;
      link.setAttribute('download', fileName);

      link.style.position = 'fixed';
      link.style.left = '-9999px';
      link.style.top = '-9999px';
      link.style.opacity = '0';

      document.body.appendChild(link);

      // Trigger download
      link.click();

      // Extra click for browsers that need it
      setTimeout(() => {
        try {
          link.click();
        } catch {
          // Ignore second-click error
        }
      }, 150);

      setTimeout(() => {
        try {
          link.remove();
        } catch {
          // Ignore remove error
        }
      }, 2000);

      return true;
    } catch (error) {
      console.error(
        'AUTO DOWNLOAD ERROR:',
        error
      );

      return false;
    }
  };

  // Payment
  const handlePayment = async (pdfToBuy = null) => {
    const pdf = pdfToBuy || selectedPdf;

    if (!pdf) {
      alert('Please select a file first.');
      return;
    }

    if (paymentStartedRef.current) {
      return;
    }

    paymentStartedRef.current = true;
    downloadStartedRef.current = false;

    setSelectedPdf(pdf);
    setLoading(true);
    setSuccessMessage('');
    setDownloadFileName('');

    if (pdfUrl) {
      window.URL.revokeObjectURL(pdfUrl);
    }

    setPdfUrl('');

    try {
      const razorpayLoaded =
        await loadRazorpayScript();

      if (!razorpayLoaded) {
        throw new Error(
          'Razorpay could not be loaded. Please check your internet connection and try again.'
        );
      }

      // Create order
      const orderResponse =
        await fetch('/create-order', {
          method: 'POST',

          headers: {
            'Content-Type': 'application/json',
          },

          body: JSON.stringify({
            pdfId: pdf.id,
          }),
        });

      let orderData;

      try {
        orderData =
          await orderResponse.json();
      } catch {
        throw new Error(
          'Invalid server response while creating payment order.'
        );
      }

      if (!orderResponse.ok) {
        throw new Error(
          orderData?.error ||
            'Unable to create payment order.'
        );
      }

      if (!orderData?.orderId) {
        throw new Error(
          'Razorpay Order ID was not received.'
        );
      }

      if (
        orderData?.amount === undefined ||
        orderData?.amount === null
      ) {
        throw new Error(
          'Payment amount was not received.'
        );
      }

      const razorpayKey =
        process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;

      if (!razorpayKey) {
        throw new Error(
          'Razorpay public key is missing. Please check Vercel Environment Variables.'
        );
      }

      const options = {
        key: razorpayKey,

        amount: Number(orderData.amount),

        currency:
          orderData.currency || 'INR',

        name:
          'sr_ePrint Online',

        description:
          `Digital File - ${pdf.name}`,

        order_id:
          orderData.orderId,

        theme: {
          color: '#059669',
        },

        handler: async function (response) {
          if (downloadStartedRef.current) {
            return;
          }

          downloadStartedRef.current = true;

          setLoading(true);

          try {
            // Verify payment
            const verifyResponse =
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
                      pdf.id,
                  }),
                }
              );

            const contentType =
              verifyResponse.headers.get(
                'content-type'
              ) || '';

            console.log(
              'VERIFY STATUS:',
              verifyResponse.status
            );

            console.log(
              'VERIFY CONTENT TYPE:',
              contentType
            );

            if (!verifyResponse.ok) {
              let errorMessage =
                'Payment verification failed.';

              try {
                const errorData =
                  await verifyResponse.json();

                errorMessage =
                  errorData?.error ||
                  errorMessage;
              } catch {
                // Ignore JSON parse error
              }

              throw new Error(
                errorMessage
              );
            }

            // Server should return the actual file,
            // not JSON.
            if (
              contentType
                .toLowerCase()
                .includes('application/json')
            ) {
              let serverMessage =
                'Server did not return the purchased file.';

              try {
                const json =
                  await verifyResponse.json();

                serverMessage =
                  json?.error ||
                  serverMessage;
              } catch {
                // Ignore JSON parse error
              }

              throw new Error(
                serverMessage
              );
            }

            // Get purchased file
            const blob =
              await verifyResponse.blob();

            if (
              !blob ||
              blob.size === 0
            ) {
              throw new Error(
                'The purchased file is empty.'
              );
            }

            console.log(
              'PURCHASED FILE SIZE:',
              blob.size
            );

            console.log(
              'PURCHASED FILE TYPE:',
              blob.type
            );

            // Create Blob URL
            const url =
              window.URL.createObjectURL(
                blob
              );

            setPdfUrl(url);

            // Create final file name
            const extension =
              getExtension(pdf.file);

            const baseName =
              pdf.file.replace(
                /\.[^/.]+$/,
                ''
              );

            const finalFileName =
              `${baseName}-payment-${response.razorpay_payment_id}${extension}`;

            setDownloadFileName(
              finalFileName
            );

            /*
              IMPORTANT:
              Automatic download is triggered
              immediately after Blob creation.
            */
            const downloadSuccess =
              startDownload(
                url,
                finalFileName
              );

            if (downloadSuccess) {
              setSuccessMessage(
                'Payment Successful! Your payment has been received and your file download has started.'
              );
            } else {
              setSuccessMessage(
                'Payment Successful! Your payment has been received. Please use the Download Again button.'
              );
            }

            setLoading(false);

            paymentStartedRef.current =
              false;

          } catch (error) {
            console.error(
              'DOWNLOAD / VERIFY ERROR:',
              error
            );

            setSuccessMessage('');

            alert(
              error?.message ||
                'Payment was received, but file download failed. Please contact support.'
            );

            setLoading(false);

            paymentStartedRef.current =
              false;

            downloadStartedRef.current =
              false;
          }
        },

        modal: {
          ondismiss: function () {
            setLoading(false);

            paymentStartedRef.current =
              false;

            downloadStartedRef.current =
              false;
          },
        },
      };

      const razorpay =
        new window.Razorpay(options);

      razorpay.on(
        'payment.failed',
        function (response) {
          console.error(
            'RAZORPAY PAYMENT FAILED:',
            response
          );

          setLoading(false);

          paymentStartedRef.current =
            false;

          downloadStartedRef.current =
            false;

          alert(
            response?.error?.description ||
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

      downloadStartedRef.current =
        false;
    }
  };

  return (
    <main
      style={{
        minHeight: '100vh',
        background: '#ffffff',
        fontFamily:
          'Arial, Helvetica, sans-serif',
      }}
    >

      {/* ================= HEADER ================= */}

      <header
        style={{
          background:
            'linear-gradient(135deg, #2563eb, #1d4ed8)',
          color: '#ffffff',
          padding: '13px 15px',
          textAlign: 'center',
        }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: '28px',
            lineHeight: '1.2',
            fontWeight: '600',
          }}
        >
          ePrint Online
        </h1>

        <p
          style={{
            margin: '3px 0 0',
            fontSize: '13px',
            lineHeight: '1.3',
          }}
        >
          Digital PDF & Excel Files
        </p>
      </header>

      <div
        style={{
          width: '100%',
          boxSizing: 'border-box',
          padding: '16px 14px 25px',
          background: '#ffffff',
        }}
      >

        {/* ================= INTRO ================= */}

        <section
          style={{
            background: '#ffffff',
            padding: '15px 6px',
            marginBottom: '4px',
          }}
        >
          <h2
            style={{
              margin: '0 0 7px',
              color: '#1e3a8a',
              fontSize: '19px',
              lineHeight: '1.3',
            }}
          >
            Digital File Store
          </h2>

          <p
            style={{
              lineHeight: '1.5',
              color: '#374151',
              margin: '3px 0',
              fontSize: '14px',
            }}
          >
            Select the required digital file,
            make a secure online payment,
            and receive your purchased file
            electronically.
          </p>

          <p
            style={{
              lineHeight: '1.5',
              color: '#059669',
              fontWeight: '600',
              margin: '6px 0 0',
              fontSize: '14px',
            }}
          >
            PDF, Excel and other digital files
            are available for online purchase.
          </p>
        </section>

        {/* ================= SUCCESS ================= */}

        {successMessage && pdfUrl && (
          <section
            style={{
              background: '#ffffff',
              border: '2px solid #16a34a',
              borderRadius: '10px',
              padding: '14px',
              marginBottom: '16px',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                fontSize: '19px',
                fontWeight: '700',
                color: '#166534',
                marginBottom: '6px',
              }}
            >
              ✅ Payment Successful
            </div>

            <div
              style={{
                color: '#166534',
                fontSize: '14px',
                lineHeight: '1.5',
                marginBottom: '7px',
              }}
            >
              Your payment has been received successfully.
              <br />
              Your purchased file is ready.
            </div>

            {downloadFileName && (
              <div
                style={{
                  color: '#14532d',
                  fontSize: '12px',
                  lineHeight: '1.4',
                  marginBottom: '8px',
                  wordBreak: 'break-word',
                }}
              >
                📄 {downloadFileName}
              </div>
            )}

            <div>
              <a
                href={pdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-block',
                  padding: '10px 18px',
                  background: '#16a34a',
                  color: '#ffffff',
                  textDecoration: 'none',
                  borderRadius: '7px',
                  fontWeight: '600',
                  fontSize: '15px',
                  margin: '3px',
                }}
              >
                📄 Open File
              </a>

              <a
                href={pdfUrl}
                download={
                  downloadFileName ||
                  'downloaded-file'
                }
                style={{
                  display: 'inline-block',
                  padding: '10px 18px',
                  background: '#2563eb',
                  color: '#ffffff',
                  textDecoration: 'none',
                  borderRadius: '7px',
                  fontWeight: '700',
                  fontSize: '15px',
                  margin: '3px',
                }}
              >
                ⬇️ Download Again
              </a>
            </div>
          </section>
        )}

        {/* ================= SELECTED FILE ================= */}

        {selectedPdf && (
          <section
            style={{
              background:
                'linear-gradient(135deg, #eff6ff, #ffffff)',

              border: '2px solid #2563eb',

              outline: '3px solid #dbeafe',

              outlineOffset: '1px',

              borderRadius: '13px',

              padding: '15px',

              margin: '10px auto 18px',

              maxWidth: '520px',

              textAlign: 'center',

              boxShadow:
                '0 5px 16px rgba(37,99,235,0.16)',

              position: 'relative',

              overflow: 'hidden',
            }}
          >

            <h2
              style={{
                margin: '2px 0 9px',
                color: '#1e3a8a',
                fontSize: '20px',
                fontWeight: '700',
                lineHeight: '1.3',
                wordBreak: 'break-word',
              }}
            >
              {selectedPdf.name}
            </h2>

            <div
              style={{
                margin: '6px 0 12px',
              }}
            >
              <div
                style={{
                  fontSize: '12px',
                  color: '#6b7280',
                  marginBottom: '2px',
                }}
              >
                Price
              </div>

              <div
                style={{
                  fontSize: '21px',
                  fontWeight: '800',
                  color: '#059669',
                }}
              >
                ₹{selectedPdf.price}
              </div>
            </div>

            <button
              onClick={() =>
                handlePayment(selectedPdf)
              }
              disabled={loading}
              style={{
                width: '100%',
                maxWidth: '420px',
                padding: '12px 15px',

                border: loading
                  ? '2px solid #9ca3af'
                  : '2px solid #047857',

                borderRadius: '7px',

                background: loading
                  ? '#9ca3af'
                  : 'linear-gradient(135deg, #059669, #047857)',

                color: '#ffffff',

                fontSize: '17px',

                fontWeight: '700',

                cursor: loading
                  ? 'not-allowed'
                  : 'pointer',

                boxShadow: loading
                  ? 'none'
                  : '0 3px 8px rgba(5,150,105,0.25)',
              }}
            >
              {loading
                ? '⏳ Processing Payment...'
                : '💳 Pay & Download'}
            </button>
          </section>
        )}

        {/* ================= SEARCH ================= */}

        <section
          style={{
            marginBottom: '14px',
            display: 'flex',
            justifyContent: 'center',
            background: '#ffffff',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '600px',
            }}
          >
            <input
              type="text"
              placeholder="🔍 Search file (Name/Number)..."
              value={search}
              onChange={(e) =>
                setSearch(e.target.value)
              }
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '12px 14px',
                borderRadius: '9px',
                border: '2px solid #fdba74',
                fontSize: '16px',
                outline: 'none',
                background: '#ffedd5',
                color: '#7c2d12',
                textAlign: 'center',
                caretColor: '#2563eb',
                fontWeight: '500',
                boxShadow:
                  '0 4px 8px rgba(234,88,12,0.10)',
              }}
            />
          </div>
        </section>

        {/* ================= AVAILABLE FILES ================= */}

        <section
          style={{
            background: '#ffffff',
            borderRadius: '12px',
            padding: '10px 2px',
            marginBottom: '8px',
          }}
        >
          <h2
            style={{
              margin: '0 0 12px',
              color: '#166534',
              fontSize: '20px',
              lineHeight: '1.3',
            }}
          >
            Available Files
          </h2>

          {filteredPdfs.length === 0 ? (
            <p
              style={{
                color: '#16a34a',
                margin: '5px 0',
                fontSize: '14px',
              }}
            >
              No files found.
            </p>
          ) : (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '13px',
              }}
            >
              {filteredPdfs.map((pdf) => (
                <div
                  key={pdf.id}
                  style={{
                    background:
                      selectedPdf?.id === pdf.id
                        ? '#ffffff'
                        : '#dcfce7',

                    border:
                      selectedPdf?.id === pdf.id
                        ? '2px solid #2563eb'
                        : '1px solid #86efac',

                    borderRadius: '9px',

                    padding: '10px',

                    display: 'flex',

                    alignItems: 'center',

                    gap: '9px',

                    width: '100%',

                    boxSizing: 'border-box',

                    flexWrap: 'wrap',

                    boxShadow:
                      selectedPdf?.id === pdf.id
                        ? '0 2px 8px rgba(37,99,235,0.15)'
                        : 'none',

                    transition:
                      'all 0.2s ease',
                  }}
                >

                  <div
                    onClick={() =>
                      handleSelectFile(pdf)
                    }
                    style={{
                      minWidth: 0,
                      flex: '1 1 170px',
                      cursor: 'pointer',
                    }}
                  >
                    <strong
                      style={{
                        color: '#111827',
                        fontSize: '16px',
                        lineHeight: '1.35',
                        display: 'block',
                        wordBreak: 'break-word',
                      }}
                    >
                      {pdf.name}
                    </strong>

                    <div
                      style={{
                        marginTop: '3px',
                        fontSize: '11px',
                        color: '#4b5563',
                        wordBreak: 'break-word',
                        lineHeight: '1.35',
                      }}
                    >
                      {getFileType(pdf.file)}
                      {' • '}
                      {pdf.file}
                    </div>
                  </div>

                  <strong
                    style={{
                      color: '#166534',
                      whiteSpace: 'nowrap',
                      fontSize: '16px',
                      flexShrink: 0,
                    }}
                  >
                    ₹{pdf.price}
                  </strong>

                  <button
                    onClick={() =>
                      handlePayment(pdf)
                    }
                    disabled={loading}
                    style={{
                      border: 'none',
                      borderRadius: '7px',
                      padding: '9px 11px',

                      background:
                        loading
                          ? '#9ca3af'
                          : '#1e3a8a',

                      color: '#ffffff',

                      fontSize: '14px',

                      fontWeight: '700',

                      cursor:
                        loading
                          ? 'not-allowed'
                          : 'pointer',

                      whiteSpace: 'nowrap',

                      flexShrink: 0,
                    }}
                  >
                    {loading &&
                    selectedPdf?.id === pdf.id
                      ? '⏳ Processing...'
                      : '💳 Pay & Download'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ================= ABOUT ================= */}

        <section
          style={{
            background: '#ffffff',
            borderRadius: '12px',
            padding: '15px 4px',
            marginBottom: '0',
          }}
        >
          <h2
            style={{
              color: '#1e3a8a',
              margin: '0 0 7px',
              fontSize: '18px',
              lineHeight: '1.3',
            }}
          >
            About sr_ePrint Online
          </h2>

          <p
            style={{
              lineHeight: '1.5',
              color: '#374151',
              margin: '5px 0',
              fontSize: '14px',
            }}
          >
            sr_ePrint Online provides digital files
            such as PDF and Excel files through
            online purchase and electronic delivery.
          </p>
        </section>

        {/* ================= DIGITAL PRODUCTS ================= */}

        <section
          style={{
            background: '#ffffff',
            borderRadius: '12px',
            padding: '15px 4px',
            marginBottom: '0',
          }}
        >
          <h2
            style={{
              color: '#1e3a8a',
              margin: '0 0 7px',
              fontSize: '17px',
              lineHeight: '1.3',
            }}
          >
            Digital Products
          </h2>

          <ul
            style={{
              lineHeight: '1.7',
              color: '#374151',
              marginTop: '0',
              marginBottom: '0',
              paddingLeft: '22px',
              fontSize: '14px',
            }}
          >
            <li>Digital PDF Files</li>
            <li>Excel Files</li>
            <li>Other Digital Files</li>
            <li>Secure Online Payment</li>
            <li>Instant Digital File Delivery</li>
          </ul>
        </section>

        {/* ================= HOW IT WORKS ================= */}

        <section
          style={{
            background: '#ffffff',
            borderRadius: '12px',
            padding: '15px 4px',
            marginBottom: '0',
          }}
        >
          <h2
            style={{
              color: '#1e3a8a',
              margin: '0 0 7px',
              fontSize: '20px',
              lineHeight: '1.3',
            }}
          >
            How It Works
          </h2>

          <ol
            style={{
              lineHeight: '1.7',
              color: '#374151',
              marginTop: '5px',
              marginBottom: '5px',
              paddingLeft: '22px',
              fontSize: '14px',
            }}
          >
            <li>Select the required digital file.</li>
            <li>Check the displayed price.</li>
            <li>Click the payment button.</li>
            <li>
              Complete the payment securely
              through Razorpay.
            </li>
            <li>Payment is securely verified.</li>
            <li>
              The purchased digital file is
              delivered electronically.
            </li>
            <li>
              If automatic download is blocked,
              use Open File or Download Again.
            </li>
          </ol>
        </section>

        {/* ================= PAYMENT & DELIVERY ================= */}

        <section
          style={{
            background: '#ffffff',
            borderRadius: '10px',
            padding: '15px 4px',
            marginBottom: '5px',
          }}
        >
          <h2
            style={{
              color: '#1e3a8a',
              margin: '0 0 7px',
              fontSize: '20px',
              lineHeight: '1.3',
            }}
          >
            Payment & Digital Delivery
          </h2>

          <p
            style={{
              lineHeight: '1.5',
              color: '#374151',
              margin: '5px 0',
              fontSize: '14px',
            }}
          >
            Payments are processed securely through
            Razorpay. After successful payment
            verification, the selected digital file
            is delivered electronically.
          </p>

          <p
            style={{
              lineHeight: '1.5',
              color: '#374151',
              margin: '5px 0',
              fontSize: '14px',
            }}
          >
            No physical shipping is involved.
            All products available on this website
            are digital files.
          </p>
        </section>

        {/* ================= CONTACT ================= */}

        <section
          style={{
            background: '#ffffff',
            borderRadius: '12px',
            padding: '15px 4px',
            marginBottom: '0',
          }}
        >
          <h2
            style={{
              color: '#1e3a8a',
              margin: '0 0 7px',
              fontSize: '19px',
              lineHeight: '1.3',
            }}
          >
            Contact Us
          </h2>

          <p
            style={{
              lineHeight: '1.6',
              color: '#374151',
              margin: '4px 0',
              fontSize: '14px',
            }}
          >
            <strong>
              sr_ePrint Online
            </strong>

            <br />

            Phone / WhatsApp: 9989057683

            <br />

            Email: sronline99890@gmail.com

            <br />
            <br />

            Business Address:

            <br />

            Sr internet online center, Near Maa Mart,
            Ieeja, Jogulamba Gadwal Dist,
            Telangana-509127, India.
          </p>
        </section>

        {/* ================= IMPORTANT INFORMATION ================= */}

        <section
          style={{
            background: '#ffffff',
            borderRadius: '12px',
            padding: '15px 4px',
            marginBottom: '0',
            textAlign: 'center',
          }}
        >
          <h3
            style={{
              margin: '0 0 10px',
              color: '#1e3a8a',
              fontSize: '14px',
            }}
          >
            Important Information
          </h3>

          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'center',
              alignItems: 'center',
              gap: '4px',
              lineHeight: '1.6',
              fontSize: '13px',
            }}
          >
            <a
              href="/privacy"
              style={{
                color: '#2563eb',
                textDecoration: 'none',
              }}
            >
              Privacy Policy
            </a>

            <span>|</span>

            <a
              href="/refund"
              style={{
                color: '#2563eb',
                textDecoration: 'none',
              }}
            >
              Refund / Cancellation
            </a>

            <span>|</span>

            <a
              href="/terms"
              style={{
                color: '#2563eb',
                textDecoration: 'none',
              }}
            >
              Terms & Conditions
            </a>

            <span>|</span>

            <a
              href="/shipping"
              style={{
                color: '#2563eb',
                textDecoration: 'none',
              }}
            >
              Shipping / Delivery
            </a>

            <span>|</span>

            <a
              href="/payment-history"
              style={{
                color: '#16a34a',
                textDecoration: 'none',
              }}
            >
              💳 Payment History
            </a>
          </div>
        </section>

        {/* ================= FOOTER ================= */}

        <footer
          style={{
            textAlign: 'center',
            padding: '16px 10px',
            color: '#374151',
            fontSize: '12px',

            background:
              'linear-gradient(135deg, #f8fafc, #dbeafe)',

            borderRadius: '12px',

            borderTop: '2px solid #93c5fd',

            boxShadow:
              '0 -2px 8px rgba(37,99,235,0.08)',
          }}
        >
          <div
            style={{
              marginBottom: '6px',
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'center',
              gap: '5px',
              lineHeight: '1.6',
            }}
          >
            <a
              href="/privacy"
              style={{
                color: '#2563eb',
                textDecoration: 'underline',
              }}
            >
              Privacy
            </a>

            <span>|</span>

            <a
              href="/refund"
              style={{
                color: '#2563eb',
                textDecoration: 'underline',
              }}
            >
              Refund
            </a>

            <span>|</span>

            <a
              href="/terms"
              style={{
                color: '#2563eb',
                textDecoration: 'underline',
              }}
            >
              Terms
            </a>

            <span>|</span>

            <a
              href="/shipping"
              style={{
                color: '#2563eb',
                textDecoration: 'underline',
              }}
            >
              Delivery
            </a>

            <span>|</span>

            <a
              href="/payment-history"
              style={{
                color: '#16a34a',
                textDecoration: 'underline',
                fontWeight: '500',
              }}
            >
              Payment History
            </a>
          </div>

          <div>
            © 2026 sr_ePrint Online.
            All Rights Reserved.
          </div>
        </footer>

      </div>

      {/* ================= WHATSAPP ================= */}

      <a
        href="https://wa.me/919989057683"
        target="_blank"
        rel="noopener noreferrer"
        style={{
          position: 'fixed',
          right: '16px',
          bottom: '16px',
          width: '50px',
          height: '50px',
          borderRadius: '50%',
          background: '#25D366',
          color: '#ffffff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          textDecoration: 'none',
          fontSize: '24px',
          boxShadow:
            '0 4px 12px rgba(0,0,0,0.25)',
          zIndex: 1000,
        }}
        aria-label="WhatsApp"
      >
        💬
      </a>

    </main>
  );
}
