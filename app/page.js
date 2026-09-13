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
    return () => {
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
    if (!fileName) {
      return '';
    }

    const parts = fileName.split('.');

    if (parts.length < 2) {
      return '';
    }

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

      const script =
        document.createElement('script');

      script.src = scriptUrl;
      script.async = true;

      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);

      document.body.appendChild(script);
    });
  };

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

  const startDownload = (url, fileName) => {
    try {
      const link =
        document.createElement('a');

      link.href = url;
      link.download = fileName;
      link.style.display = 'none';

      document.body.appendChild(link);

      link.click();

      setTimeout(() => {
        link.remove();
      }, 1500);

      return true;
    } catch (error) {
      console.error(
        'AUTO DOWNLOAD ERROR:',
        error
      );

      return false;
    }
  };

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
          color: '#2563eb',
        },

        handler: async function (response) {
          if (downloadStartedRef.current) {
            return;
          }

          downloadStartedRef.current = true;

          setLoading(true);

          try {
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

            // JSON means server returned an error/message
            // instead of the purchased file.
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

            const url =
              window.URL.createObjectURL(
                blob
              );

            setPdfUrl(url);

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
        fontFamily: 'Arial, sans-serif',
      }}
    >

      {/* HEADER */}
      <header
        style={{
          background:
            'linear-gradient(135deg, #2563eb, #1d4ed8)',
          color: 'white',
          padding: '24px 15px',
          textAlign: 'center',
        }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: '30px',
            fontWeight: '600',
          }}
        >
          sr_ePrint Online
        </h1>

        <p
          style={{
            marginTop: '2px',
            marginBottom: 0,
            fontSize: '14px',
          }}
        >
          Digital PDF & Excel Files
        </p>
      </header>

      <div
        style={{
          width: '100%',
          boxSizing: 'border-box',
          padding: '18px 15px 30px',
          background: '#ffffff',
        }}
      >

        {/* INTRO */}
        <section
          style={{
            background: '#ffffff',
            borderRadius: '10px',
            padding: '18px 20px',
            marginBottom: '10px',
          }}
        >
          <h2
            style={{
              margin: '0 0 7px 0',
              color: '#1e3a8a',
              fontSize: '23px',
            }}
          >
            Digital File Store
          </h2>

          <p
            style={{
              lineHeight: '1.5',
              color: '#374151',
              margin: '4px 0',
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
              margin: '4px 0 0',
            }}
          >
            PDF, Excel and other digital files
            are available for online purchase.
          </p>
        </section>

        {/* SUCCESS */}
        {successMessage && pdfUrl && (
          <section
            style={{
              background: '#ffffff',
              border: '2px solid #16a34a',
              borderRadius: '10px',
              padding: '14px',
              marginBottom: '10px',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                fontSize: '20px',
                fontWeight: '600',
                color: '#166534',
                marginBottom: '5px',
              }}
            >
              ✅ Payment Successful
            </div>

            <div
              style={{
                color: '#166534',
                fontSize: '14px',
                lineHeight: '1.45',
                marginBottom: '8px',
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
                  padding: '10px 20px',
                  background: '#16a34a',
                  color: 'white',
                  textDecoration: 'none',
                  borderRadius: '8px',
                  fontWeight: '600',
                  fontSize: '16px',
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
                  padding: '10px 20px',
                  background: '#2563eb',
                  color: 'white',
                  textDecoration: 'none',
                  borderRadius: '7px',
                  fontWeight: '700',
                  fontSize: '18px',
                  margin: '3px',
                }}
              >
                ⬇️ Download Again
              </a>
            </div>
          </section>
        )}

        {/* SELECTED FILE */}
        {selectedPdf && (
          <section
            style={{
              background: '#ffffff',
              borderRadius: '10px',
              padding: '16px',
              marginBottom: '10px',
              textAlign: 'center',
            }}
          >
            <h2
              style={{
                margin: '0 0 6px 0',
                color: '#1e3a8a',
                fontSize: '22px',
                wordBreak: 'break-word',
              }}
            >
              {selectedPdf.name}
            </h2>

            <p
              style={{
                color: '#6b7280',
                wordBreak: 'break-word',
                lineHeight: '1.4',
                margin: '5px 0',
              }}
            >
              {getFileType(selectedPdf.file)} File
              <br />
              {selectedPdf.file}
            </p>

            <div
              style={{
                fontSize: '24px',
                fontWeight: '600',
                color: '#059669',
                margin: '10px 0 14px',
              }}
            >
              ₹{selectedPdf.price}
            </div>

            <button
              onClick={() =>
                handlePayment(selectedPdf)
              }
              disabled={loading}
              style={{
                width: '100%',
                maxWidth: '300px',
                padding: '13px',
                border: 'none',
                borderRadius: '8px',
                background:
                  loading
                    ? '#9ca3af'
                    : '#2563eb',
                color: 'white',
                fontSize: '16px',
                fontWeight: '700',
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
          </section>
        )}

        {/* SEARCH */}
        <section
          style={{
            marginBottom: '12px',
            display: 'flex',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              width: '80%',
              maxWidth: '650px',
            }}
          >
            <input
              type="text"
              placeholder="🔍 Search PDF file / Excel file..."
              value={search}
              onChange={(e) =>
                setSearch(e.target.value)
              }
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '13px 16px',
                borderRadius: '10px',
                border: '2px solid #fdba74',
                fontSize: '18px',
                outline: 'none',
                background: '#ffedd5',
                color: '#7c2d12',
                textAlign: 'center',
                boxShadow:
                  '0 3px 8px rgba(234,88,12,0.10)',
              }}
            />
          </div>
        </section>

        {/* AVAILABLE FILES */}
        <section
          style={{
            background: '#dcfce7',
            borderRadius: '12px',
            padding: '16px',
            marginBottom: '12px',
          }}
        >
          <h2
            style={{
              margin: '0 0 12px 0',
              color: '#166534',
              fontSize: '22px',
            }}
          >
            Available Files
          </h2>

          {filteredPdfs.length === 0 ? (
            <p
              style={{
                color: '#374151',
                margin: '5px 0',
              }}
            >
              No files found.
            </p>
          ) : (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              {filteredPdfs.map((pdf) => (
                <div
                  key={pdf.id}
                  style={{
                    background:
                      selectedPdf?.id === pdf.id
                        ? '#ffffff'
                        : '#bbf7d0',

                    border:
                      selectedPdf?.id === pdf.id
                        ? '2px solid #16a34a'
                        : '1px solid #86efac',

                    borderRadius: '9px',

                    padding: '10px 11px',

                    display: 'flex',

                    alignItems: 'center',

                    gap: '10px',

                    width: '100%',

                    boxSizing: 'border-box',

                    flexWrap: 'wrap',
                  }}
                >

                  {/* FILE NAME */}
                  <div
                    onClick={() =>
                      handleSelectFile(pdf)
                    }
                    style={{
                      minWidth: 0,
                      flex: '1 1 180px',
                      cursor: 'pointer',
                    }}
                  >
                    <strong
                      style={{
                        color: '#111827',
                        fontSize: '15px',
                        display: 'block',
                        wordBreak: 'break-word',
                      }}
                    >
                      {pdf.name}
                    </strong>

                    <div
                      style={{
                        marginTop: '3px',
                        fontSize: '12px',
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

                  {/* PRICE */}
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

                  {/* PAY BUTTON */}
                  <button
                    onClick={() =>
                      handlePayment(pdf)
                    }
                    disabled={loading}
                    style={{
                      border: 'none',
                      borderRadius: '7px',
                      padding: '9px 12px',
                      background:
                        loading
                          ? '#9ca3af'
                          : '#2563eb',
                      color: '#ffffff',
                      fontSize: '13px',
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
                      : `💳 Pay ₹${pdf.price} & Download`}
                  </button>

                </div>
              ))}
            </div>
          )}
        </section>

        {/* ABOUT */}
        <section
          style={{
            background: '#ffffff',
            borderRadius: '12px',
            padding: '18px',
            marginBottom: '12px',
          }}
        >
          <h2
            style={{
              color: '#1e3a8a',
              margin: '0 0 7px 0',
              fontSize: '18px',
            }}
          >
            About sr_ePrint Online
          </h2>

          <p
            style={{
              lineHeight: '1.5',
              color: '#374151',
              margin: '5px 0',
            }}
          >
            sr_ePrint Online provides digital files
            such as PDF and Excel files through
            online purchase and electronic delivery.
          </p>
        </section>

        {/* DIGITAL PRODUCTS */}
        <section
          style={{
            background: '#ffffff',
            borderRadius: '12px',
            padding: '18px',
            marginBottom: '12px',
          }}
        >
          <h2
            style={{
              color: '#1e3a8a',
              margin: '0 0 7px 0',
              fontSize: '16px',
            }}
          >
            Digital Products
          </h2>

          <ul
            style={{
              lineHeight: '1.7',
              color: '#374151',
              marginTop: '5px',
              marginBottom: '5px',
            }}
          >
            <li>Digital PDF Files</li>
            <li>Excel Files</li>
            <li>Other Digital Files</li>
            <li>Secure Online Payment</li>
            <li>Instant Digital File Delivery</li>
          </ul>
        </section>

        {/* HOW IT WORKS */}
        <section
          style={{
            background: '#ffffff',
            borderRadius: '12px',
            padding: '18px',
            marginBottom: '12px',
          }}
        >
          <h2
            style={{
              color: '#1e3a8a',
              margin: '0 0 7px 0',
              fontSize: '21px',
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

        {/* PAYMENT & DELIVERY */}
        <section
          style={{
            background: '#ffffff',
            borderRadius: '10px',
            padding: '18px',
            marginBottom: '12px',
          }}
        >
          <h2
            style={{
              color: '#1e3a8a',
              margin: '0 0 7px 0',
              fontSize: '21px',
            }}
          >
            Payment & Digital Delivery
          </h2>

          <p
            style={{
              lineHeight: '1.5',
              color: '#374151',
              margin: '5px 0',
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
            }}
          >
            No physical shipping is involved.
            All products available on this website
            are digital files.
          </p>
        </section>

        {/* CONTACT */}
        <section
          style={{
            background: '#ffffff',
            borderRadius: '12px',
            padding: '18px',
            marginBottom: '12px',
          }}
        >
          <h2
            style={{
              color: '#1e3a8a',
              margin: '0 0 7px 0',
              fontSize: '20px',
            }}
          >
            Contact Us
          </h2>

          <p
            style={{
              lineHeight: '1.6',
              color: '#374151',
              margin: '5px 0',
            }}
          >
            <strong>
              sr_ePrint Online
            </strong>

            <br />

            Phone / WhatsApp: 9989057683

            <br />

            Email: sronline99890@gmail.com
          </p>

          <p
            style={{
              margin: '10px 0 0',
              fontSize: '15px',
              lineHeight: 1.6,
              color: '#374151',
            }}
          >
            <strong>
              Business Address:
            </strong>

            <br />

            Sr internet online center,

            <br />

            New Maa Mart backside, Kurnool Road,

            <br />

            Ieeja, Jogulamba Gadwal District,

            <br />

            Telangana - 509127, India
          </p>
        </section>

        {/* IMPORTANT INFORMATION */}
        <section
          style={{
            background: '#ffffff',
            borderRadius: '12px',
            padding: '16px',
            marginBottom: '12px',
            textAlign: 'center',
          }}
        >
          <h3
            style={{
              margin: '0 0 10px 0',
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
              gap: '8px',
              lineHeight: '1.5',
            }}
          >
            <a
              href="/privacy"
              style={{
                color: '#2563eb',
                textDecoration: 'none',
                fontWeight: '500',
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
                fontWeight: '500',
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
                fontWeight: '500',
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
                fontWeight: '500',
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
                fontWeight: '500',
              }}
            >
              💳 Payment History
            </a>
          </div>
        </section>

        {/* FOOTER */}
<footer
  style={{
    textAlign: 'center',
    padding: '18px 12px',
    color: '#475569',
    fontSize: '12px',

    // Light colour footer
    background:
      'linear-gradient(135deg, #ffffff, #eff6ff)',

    borderRadius: '12px',

    // Soft light blue top line
    borderTop: '2px solid #bfdbfe',

    boxShadow:
      '0 -2px 8px rgba(59,130,246,0.06)',
  }}
>
  <div
    style={{
      marginBottom: '8px',
      display: 'flex',
      flexWrap: 'wrap',
      justifyContent: 'center',
      gap: '8px',
    }}
  >
    <a
      href="/privacy"
      style={{
        color: '#3b82f6',
        textDecoration: 'none',
      }}
    >
      Privacy
    </a>

    <span>|</span>

    <a
      href="/refund"
      style={{
        color: '#3b82f6',
        textDecoration: 'none',
      }}
    >
      Refund
    </a>

    <span>|</span>

    <a
      href="/terms"
      style={{
        color: '#3b82f6',
        textDecoration: 'none',
      }}
    >
      Terms
    </a>

    <span>|</span>

    <a
      href="/shipping"
      style={{
        color: '#3b82f6',
        textDecoration: 'none',
      }}
    >
      Delivery
    </a>

    <span>|</span>

    <a
      href="/payment-history"
      style={{
        color: '#16a34a',
        textDecoration: 'none',
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

      {/* WHATSAPP */}
      <a
        href="https://wa.me/919989057683"
        target="_blank"
        rel="noopener noreferrer"
        style={{
          position: 'fixed',
          right: '18px',
          bottom: '18px',
          width: '52px',
          height: '52px',
          borderRadius: '50%',
          background: '#25D366',
          color: 'white',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          textDecoration: 'none',
          fontSize: '25px',
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
