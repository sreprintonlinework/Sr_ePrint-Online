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

  // ==========================================
  // CLEAN OBJECT URL
  // ==========================================

  useEffect(() => {
    return () => {
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
      }
    };
  }, [pdfUrl]);

  // ==========================================
  // FILE TYPE
  // ==========================================

  const getFileType = (fileName = '') => {
    const ext = fileName.split('.').pop()?.toLowerCase();

    if (ext === 'pdf') return 'PDF';
    if (ext === 'xls') return 'Excel';
    if (ext === 'xlsx') return 'Excel';
    if (ext === 'doc') return 'Word';
    if (ext === 'docx') return 'Word';
    if (ext === 'jpg') return 'Image';
    if (ext === 'jpeg') return 'Image';
    if (ext === 'png') return 'Image';
    if (ext === 'txt') return 'Text';

    return 'File';
  };

  // ==========================================
  // SEARCH
  // A-Z SORTING REMOVED
  // pdfs.js ORDER WILL BE USED
  // ==========================================

  const filteredPdfs = pdfs.filter((pdf) =>
    pdf.name.toLowerCase().includes(search.toLowerCase())
  );

  // ==========================================
  // LOAD RAZORPAY
  // ==========================================

  const loadRazorpayScript = () => {
    return new Promise((resolve) => {
      if (window.Razorpay) {
        resolve(true);
        return;
      }

      const script = document.createElement('script');

      script.src = 'https://checkout.razorpay.com/v1/checkout.js';

      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);

      document.body.appendChild(script);
    });
  };

  // ==========================================
  // SELECT FILE
  // ==========================================

  const handleSelectFile = (pdf) => {
    setSelectedPdf(pdf);
    setSuccessMessage('');
    setDownloadFileName('');

    if (pdfUrl) {
      URL.revokeObjectURL(pdfUrl);
    }

    setPdfUrl('');
    downloadStartedRef.current = false;
  };

  // ==========================================
  // START DOWNLOAD
  // ==========================================

  const startDownload = (url, fileName) => {
    if (!url) return;

    try {
      const link = document.createElement('a');

      link.href = url;
      link.download = fileName || 'download';
      link.style.display = 'none';

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

    if (paymentStartedRef.current) {
      return;
    }

    paymentStartedRef.current = true;
    setLoading(true);
    setSuccessMessage('');

    try {
      // ==========================================
      // LOAD RAZORPAY
      // ==========================================

      const razorpayLoaded = await loadRazorpayScript();

      if (!razorpayLoaded) {
        throw new Error(
          'Razorpay failed to load. Please check your internet connection.'
        );
      }

      // ==========================================
      // CREATE ORDER
      // ==========================================

      const orderResponse = await fetch('/create-order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          pdfId: selectedPdf.id,
        }),
      });

      const orderContentType =
        orderResponse.headers.get('content-type') || '';

      let orderData;

      if (orderContentType.includes('application/json')) {
        orderData = await orderResponse.json();
      } else {
        const text = await orderResponse.text();
        throw new Error(
          text || 'Unable to create Razorpay order.'
        );
      }

      if (!orderResponse.ok) {
        throw new Error(
          orderData?.error ||
            orderData?.message ||
            'Unable to create Razorpay order.'
        );
      }

      const orderId = orderData?.orderId;

      const amount =
        orderData?.amount ??
        Math.round(Number(selectedPdf.price) * 100);

      if (!orderId) {
        throw new Error('Razorpay Order ID not received.');
      }

      // ==========================================
      // RAZORPAY KEY
      // ==========================================

      const razorpayKey =
        process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;

      if (!razorpayKey) {
        throw new Error(
          'Razorpay Key ID is missing. Please check Vercel Environment Variables.'
        );
      }

      // ==========================================
      // RAZORPAY OPTIONS
      // ==========================================

      const options = {
        key: razorpayKey,

        amount: amount,

        currency: 'INR',

        name: 'SR E-Print Online',

        description: `Digital File - ${selectedPdf.name}`,

        order_id: orderId,

        prefill: {
          name: '',
          email: '',
          contact: '',
        },

        theme: {
          color: '#2563eb',
        },

        handler: async function (response) {
          try {
            setLoading(true);

            // ==========================================
            // VERIFY PAYMENT
            // ==========================================

            const verifyResponse = await fetch(
              '/verify-payment',
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  razorpay_order_id:
                    response.razorpay_order_id,

                  razorpay_payment_id:
                    response.razorpay_payment_id,

                  razorpay_signature:
                    response.razorpay_signature,

                  pdfId: selectedPdf.id,
                }),
              }
            );

            // ==========================================
            // CHECK RESPONSE TYPE
            // ==========================================

            const contentType =
              verifyResponse.headers.get('content-type') ||
              '';

            console.log(
              'Verify response content type:',
              contentType
            );

            // ==========================================
            // JSON = ERROR RESPONSE
            // FILE/BLOB = SUCCESS
            // ==========================================

            if (contentType.includes('application/json')) {
              const errorData =
                await verifyResponse.json();

              throw new Error(
                errorData?.error ||
                  errorData?.message ||
                  'Payment verification failed.'
              );
            }

            if (!verifyResponse.ok) {
              throw new Error(
                'Payment verification failed.'
              );
            }

            // ==========================================
            // GET FILE BLOB
            // ==========================================

            const blob = await verifyResponse.blob();

            if (!blob || blob.size === 0) {
              throw new Error(
                'Downloaded file is empty.'
              );
            }

            // ==========================================
            // CREATE FILE URL
            // ==========================================

            const objectUrl = URL.createObjectURL(blob);

            if (pdfUrl) {
              URL.revokeObjectURL(pdfUrl);
            }

            setPdfUrl(objectUrl);

            // ==========================================
            // CREATE DOWNLOAD FILE NAME
            // ==========================================

            const originalFile =
              selectedPdf.file || 'download';

            const lastDot =
              originalFile.lastIndexOf('.');

            let baseName = originalFile;
            let extension = '';

            if (lastDot > 0) {
              baseName =
                originalFile.substring(0, lastDot);

              extension =
                originalFile.substring(lastDot);
            }

            const finalFileName =
              `${baseName}-payment-${response.razorpay_payment_id}${extension}`;

            setDownloadFileName(finalFileName);

            // ==========================================
            // AUTO DOWNLOAD
            // ==========================================

            if (!downloadStartedRef.current) {
              downloadStartedRef.current = true;

              setTimeout(() => {
                startDownload(
                  objectUrl,
                  finalFileName
                );
              }, 300);
            }

            // ==========================================
            // SUCCESS MESSAGE
            // ==========================================

            setSuccessMessage(
              `Payment successful! ${selectedPdf.name} is ready for download.`
            );

            setLoading(false);
            paymentStartedRef.current = false;
          } catch (error) {
            console.error(
              'Payment verification error:',
              error
            );

            alert(
              error?.message ||
                'Payment successful, but file download failed. Please try Download Again.'
            );

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

        'payment.failed': function (response) {
          console.error(
            'Payment failed:',
            response
          );

          alert(
            response?.error?.description ||
              'Payment failed. Please try again.'
          );

          setLoading(false);
          paymentStartedRef.current = false;
        },
      };

      // ==========================================
      // OPEN RAZORPAY
      // ==========================================

      const razorpay = new window.Razorpay(options);

      razorpay.on(
        'payment.failed',
        function (response) {
          console.error(
            'Payment failed:',
            response
          );

          setLoading(false);
          paymentStartedRef.current = false;
        }
      );

      razorpay.open();
    } catch (error) {
      console.error(
        'Payment error:',
        error
      );

      alert(
        error?.message ||
          'Something went wrong. Please try again.'
      );

      setLoading(false);
      paymentStartedRef.current = false;
    }
  };

  // ==========================================
  // OPEN FILE
  // ==========================================

  const handleOpenFile = () => {
    if (!pdfUrl) return;

    window.open(
      pdfUrl,
      '_blank',
      'noopener,noreferrer'
    );
  };

  // ==========================================
  // DOWNLOAD AGAIN
  // ==========================================

  const handleDownloadAgain = () => {
    if (!pdfUrl) return;

    startDownload(
      pdfUrl,
      downloadFileName || 'download'
    );
  };

  // ==========================================
  // PAGE
  // ==========================================

  return (
    <main
      style={{
        minHeight: '100vh',
        background: '#f8fafc',
        color: '#111827',
        fontFamily:
          'Arial, Helvetica, sans-serif',
      }}
    >
      {/* ======================================
          HEADER
      ====================================== */}

      <header
        style={{
          background:
            'linear-gradient(135deg, #2563eb, #1d4ed8)',
          color: 'white',
          padding: '22px 15px',
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
            margin: '7px 0 0',
            fontSize: '16px',
            fontWeight: '500',
          }}
        >
          Digital PDF & Excel Files
        </p>
      </header>

      {/* ======================================
          MAIN CONTAINER
      ====================================== */}

      <div
        style={{
          maxWidth: '900px',
          margin: '0 auto',
          padding: '20px 14px 80px',
        }}
      >
        {/* ====================================
            INTRO
        ==================================== */}

        <section
          style={{
            background: 'white',
            borderRadius: '14px',
            padding: '20px',
            marginBottom: '18px',
            boxShadow:
              '0 2px 10px rgba(0,0,0,0.06)',
          }}
        >
          <h2
            style={{
              margin: '0 0 8px',
              fontSize: '24px',
              fontWeight: '800',
            }}
          >
            Welcome to SR E-Print Online
          </h2>

          <p
            style={{
              margin: 0,
              fontSize: '16px',
              lineHeight: '1.6',
              color: '#4b5563',
            }}
          >
            Select a digital file, make secure payment
            through Razorpay and download your file
            instantly.
          </p>
        </section>

        {/* ====================================
            SELECTED FILE + PAYMENT
            THIS IS ABOVE SEARCH BAR
        ==================================== */}

        {selectedPdf && (
          <section
            style={{
              background: 'white',
              borderRadius: '14px',
              padding: '20px',
              marginBottom: '18px',
              border:
                '2px solid #2563eb',
              boxShadow:
                '0 3px 12px rgba(37,99,235,0.12)',
            }}
          >
            <div
              style={{
                fontSize: '14px',
                color: '#6b7280',
                marginBottom: '6px',
                fontWeight: '600',
              }}
            >
              Selected File
            </div>

            <h2
              style={{
                margin: '0 0 10px',
                fontSize: '28px',
                lineHeight: '1.3',
                fontWeight: '800',
                color: '#111827',
                wordBreak: 'break-word',
              }}
            >
              {selectedPdf.name}
            </h2>

            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '10px',
                alignItems: 'center',
                marginBottom: '16px',
              }}
            >
              <span
                style={{
                  background: '#eff6ff',
                  color: '#1d4ed8',
                  padding: '7px 12px',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '700',
                }}
              >
                {getFileType(
                  selectedPdf.file
                )}
              </span>

              <span
                style={{
                  background: '#f0fdf4',
                  color: '#15803d',
                  padding: '7px 12px',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '700',
                }}
              >
                ₹{selectedPdf.price}
              </span>
            </div>

            {/* ==================================
                PAYMENT BUTTON
            ================================== */}

            {!successMessage && (
              <button
                onClick={handlePayment}
                disabled={loading}
                style={{
                  width: '100%',
                  border: 'none',
                  borderRadius: '10px',
                  padding: '15px',
                  background: loading
                    ? '#94a3b8'
                    : '#16a34a',
                  color: 'white',
                  fontSize: '18px',
                  fontWeight: '800',
                  cursor: loading
                    ? 'not-allowed'
                    : 'pointer',
                }}
              >
                {loading
                  ? 'Processing Payment...'
                  : `Pay ₹${selectedPdf.price} & Download`}
              </button>
            )}

            {/* ==================================
                SUCCESS
            ================================== */}

            {successMessage && (
              <div
                style={{
                  marginTop: '5px',
                  background: '#f0fdf4',
                  border:
                    '1px solid #86efac',
                  borderRadius: '10px',
                  padding: '15px',
                }}
              >
                <div
                  style={{
                    color: '#166534',
                    fontWeight: '700',
                    fontSize: '15px',
                    marginBottom: '12px',
                    lineHeight: '1.5',
                  }}
                >
                  {successMessage}
                </div>

                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '10px',
                  }}
                >
                  <button
                    onClick={handleOpenFile}
                    disabled={!pdfUrl}
                    style={{
                      flex: '1 1 180px',
                      border: 'none',
                      borderRadius: '9px',
                      padding: '12px',
                      background: '#2563eb',
                      color: 'white',
                      fontSize: '16px',
                      fontWeight: '700',
                      cursor: 'pointer',
                    }}
                  >
                    Open File
                  </button>

                  <button
                    onClick={
                      handleDownloadAgain
                    }
                    disabled={!pdfUrl}
                    style={{
                      flex: '1 1 180px',
                      border: 'none',
                      borderRadius: '9px',
                      padding: '12px',
                      background: '#16a34a',
                      color: 'white',
                      fontSize: '16px',
                      fontWeight: '700',
                      cursor: 'pointer',
                    }}
                  >
                    Download Again
                  </button>
                </div>
              </div>
            )}

            {/* ==================================
                CHANGE FILE
            ================================== */}

            <button
              onClick={() =>
                handleSelectFile(null)
              }
              style={{
                marginTop: '12px',
                width: '100%',
                border:
                  '1px solid #d1d5db',
                borderRadius: '9px',
                padding: '10px',
                background: 'white',
                color: '#374151',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer',
              }}
            >
              Select Another File
            </button>
          </section>
        )}

        {/* ====================================
            SEARCH BAR
        ==================================== */}

        <section
          style={{
            marginBottom: '18px',
          }}
        >
          <input
            type="text"
            value={search}
            onChange={(e) =>
              setSearch(e.target.value)
            }
            placeholder="Search PDF / Excel file..."
            style={{
              width: '80%',
              display: 'block',
              margin: '0 auto',
              padding: '14px 16px',
              fontSize: '16px',
              borderRadius: '10px',
              border:
                '2px solid #fdba74',
              background: '#ffedd5',
              color: '#111827',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </section>

        {/* ====================================
            AVAILABLE FILES
        ==================================== */}

        <section
          style={{
            background: 'white',
            borderRadius: '14px',
            padding: '18px',
            marginBottom: '20px',
            boxShadow:
              '0 2px 10px rgba(0,0,0,0.06)',
          }}
        >
          <h2
            style={{
              margin: '0 0 15px',
              fontSize: '23px',
              fontWeight: '800',
              color: '#15803d',
            }}
          >
            Available Files
          </h2>

          {filteredPdfs.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: '25px 10px',
                color: '#6b7280',
                fontSize: '16px',
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
                <button
                  key={pdf.id}
                  onClick={() =>
                    handleSelectFile(pdf)
                  }
                  style={{
                    textAlign: 'left',
                    border:
                      selectedPdf?.id === pdf.id
                        ? '2px solid #2563eb'
                        : '1px solid #e5e7eb',
                    borderRadius: '11px',
                    background:
                      selectedPdf?.id === pdf.id
                        ? '#eff6ff'
                        : 'white',
                    padding: '14px',
                    cursor: 'pointer',
                    minWidth: 0,
                  }}
                >
                  {/* FILE NAME */}
                  <div
                    style={{
                      fontSize: '18px',
                      fontWeight: '800',
                      color: '#111827',
                      lineHeight: '1.35',
                      wordBreak: 'break-word',
                      marginBottom: '7px',
                    }}
                  >
                    {pdf.name}
                  </div>

                  {/* FILE TYPE */}
                  <div
                    style={{
                      fontSize: '13px',
                      color: '#6b7280',
                      marginBottom: '8px',
                      wordBreak:
                        'break-word',
                    }}
                  >
                    {getFileType(pdf.file)} •{' '}
                    {pdf.file}
                  </div>

                  {/* PRICE */}
                  <div
                    style={{
                      fontSize: '17px',
                      fontWeight: '800',
                      color: '#16a34a',
                    }}
                  >
                    ₹{pdf.price}
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        {/* ====================================
            ABOUT
        ==================================== */}

        <section
          style={{
            background: 'white',
            borderRadius: '14px',
            padding: '20px',
            marginBottom: '18px',
          }}
        >
          <h2
            style={{
              margin: '0 0 10px',
              fontSize: '22px',
              fontWeight: '800',
            }}
          >
            About SR E-Print Online
          </h2>

          <p
            style={{
              margin: 0,
              fontSize: '15px',
              lineHeight: '1.7',
              color: '#4b5563',
            }}
          >
            SR E-Print Online provides digital PDF,
            Excel and other online files. Customers
            can select the required digital product,
            complete payment securely through
            Razorpay and receive the file instantly.
          </p>
        </section>

        {/* ====================================
            DIGITAL PRODUCTS
        ==================================== */}

        <section
          style={{
            background: 'white',
            borderRadius: '14px',
            padding: '20px',
            marginBottom: '18px',
          }}
        >
          <h2
            style={{
              margin: '0 0 10px',
              fontSize: '22px',
              fontWeight: '800',
            }}
          >
            Digital Products
          </h2>

          <p
            style={{
              margin: 0,
              fontSize: '15px',
              lineHeight: '1.7',
              color: '#4b5563',
            }}
          >
            All products available on this website
            are digital files. No physical products
            are shipped.
          </p>
        </section>

        {/* ====================================
            HOW IT WORKS
        ==================================== */}

        <section
          style={{
            background: 'white',
            borderRadius: '14px',
            padding: '20px',
            marginBottom: '18px',
          }}
        >
          <h2
            style={{
              margin: '0 0 12px',
              fontSize: '22px',
              fontWeight: '800',
            }}
          >
            How It Works
          </h2>

          <ol
            style={{
              margin: 0,
              paddingLeft: '22px',
              fontSize: '15px',
              lineHeight: '1.8',
              color: '#4b5563',
            }}
          >
            <li>Select the required file.</li>
            <li>
              Click Pay & Download.
            </li>
            <li>
              Complete payment through Razorpay.
            </li>
            <li>
              Your digital file will download
              automatically.
            </li>
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
            marginBottom: '18px',
          }}
        >
          <h2
            style={{
              margin: '0 0 10px',
              fontSize: '22px',
              fontWeight: '800',
            }}
          >
            Payment & Digital Delivery
          </h2>

          <p
            style={{
              margin: 0,
              fontSize: '15px',
              lineHeight: '1.7',
              color: '#4b5563',
            }}
          >
            Payments are securely processed through
            Razorpay. After successful payment,
            the purchased digital file is provided
            for download.
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
            marginBottom: '18px',
          }}
        >
          <h2
            style={{
              margin: '0 0 12px',
              fontSize: '22px',
              fontWeight: '800',
            }}
          >
            Contact
          </h2>

          <p
            style={{
              margin: '6px 0',
              fontSize: '15px',
            }}
          >
            <strong>Business:</strong>{' '}
            SR E-Print Online
          </p>

          <p
            style={{
              margin: '6px 0',
              fontSize: '15px',
            }}
          >
            <strong>Contact Person:</strong>{' '}
            Gs Raju
          </p>

          <p
            style={{
              margin: '6px 0',
              fontSize: '15px',
            }}
          >
            <strong>Email:</strong>{' '}
            sronline99890@gmail.com
          </p>

          <p
            style={{
              margin: '6px 0',
              fontSize: '15px',
            }}
          >
            <strong>Phone / WhatsApp:</strong>{' '}
            9989057683
          </p>

          <p
            style={{
              margin: '6px 0',
              fontSize: '15px',
              lineHeight: '1.6',
            }}
          >
            <strong>Address:</strong>{' '}
            Sr internet online center, New Maa Mart
            backside, Kurnool Road, Ieeja,
            Jogulamba Gadwal District,
            Telangana - 509127, India
          </p>
        </section>

        {/* ====================================
            IMPORTANT INFORMATION
        ==================================== */}

        <section
          style={{
            background: '#fff7ed',
            borderRadius: '14px',
            padding: '20px',
            marginBottom: '18px',
            border:
              '1px solid #fed7aa',
          }}
        >
          <h2
            style={{
              margin: '0 0 10px',
              fontSize: '21px',
              fontWeight: '800',
            }}
          >
            Important Information
          </h2>

          <p
            style={{
              margin: 0,
              fontSize: '14px',
              lineHeight: '1.7',
              color: '#7c2d12',
            }}
          >
            These are digital products. Please
            select the correct file before making
            payment. Once payment is completed,
            the digital file is made available for
            download.
          </p>
        </section>
      </div>

      {/* ======================================
          FOOTER
      ====================================== */}

      <footer
        style={{
          background: '#111827',
          color: 'white',
          textAlign: 'center',
          padding: '22px 15px',
        }}
      >
        <p
          style={{
            margin: '0 0 7px',
            fontSize: '14px',
          }}
        >
          © {new Date().getFullYear()} SR E-Print
          Online
        </p>

        <p
          style={{
            margin: 0,
            fontSize: '13px',
            color: '#d1d5db',
          }}
        >
          Digital PDF & Online Services
        </p>
      </footer>

      {/* ======================================
          WHATSAPP BUTTON
      ====================================== */}

      <a
        href="https://wa.me/919989057683"
        target="_blank"
        rel="noopener noreferrer"
        style={{
          position: 'fixed',
          right: '18px',
          bottom: '18px',
          width: '56px',
          height: '56px',
          borderRadius: '50%',
          background: '#25D366',
          color: 'white',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          textDecoration: 'none',
          fontSize: '27px',
          fontWeight: '800',
          boxShadow:
            '0 4px 12px rgba(0,0,0,0.25)',
          zIndex: 9999,
        }}
        aria-label="WhatsApp"
      >
        W
      </a>
    </main>
  );
}
