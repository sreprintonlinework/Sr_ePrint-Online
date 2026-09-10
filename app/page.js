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
window.URL.revokeObjectURL(pdfUrl);
}
};
}, [pdfUrl]);

// ==========================================
// FILTER FILES
// ==========================================

const filteredPdfs = pdfs.filter((pdf) =>
pdf.name
.toLowerCase()
.includes(search.toLowerCase())
);

// ==========================================
// GET FILE EXTENSION
// ==========================================

const getExtension = (fileName) => {
if (!fileName) return '';

const parts = fileName.split('.');

if (parts.length < 2) {
  return '';
}

return '.' + parts[parts.length - 1].toLowerCase();

};

// ==========================================
// GET FILE TYPE
// ==========================================

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

  default:
    return 'File';
}

};

// ==========================================
// LOAD RAZORPAY SCRIPT
// ==========================================

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

// ==========================================
// SELECT FILE
// ==========================================

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

// ==========================================
// START DOWNLOAD
// ==========================================

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
  }, 1000);

  return true;
} catch (error) {
  console.error(
    'AUTO DOWNLOAD ERROR:',
    error
  );

  return false;
}

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

if (paymentStartedRef.current) {
  return;
}

paymentStartedRef.current = true;
downloadStartedRef.current = false;

setLoading(true);
setSuccessMessage('');
setDownloadFileName('');

if (pdfUrl) {
  window.URL.revokeObjectURL(pdfUrl);
}

setPdfUrl('');

try {
  // ========================================
  // LOAD RAZORPAY
  // ========================================

  const razorpayLoaded =
    await loadRazorpayScript();

  if (!razorpayLoaded) {
    throw new Error(
      'Razorpay could not be loaded. Please check your internet connection and try again.'
    );
  }

  // ========================================
  // CREATE ORDER
  // ========================================

  const orderResponse =
    await fetch('/create-order', {
      method: 'POST',

      headers: {
        'Content-Type':
          'application/json',
      },

      body: JSON.stringify({
        pdfId: selectedPdf.id,
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

  // ========================================
  // CHECK ORDER ID
  // ========================================

  if (!orderData?.orderId) {
    throw new Error(
      'Razorpay Order ID was not received.'
    );
  }

  // ========================================
  // CHECK AMOUNT
  // ========================================

  if (
    orderData?.amount === undefined ||
    orderData?.amount === null
  ) {
    throw new Error(
      'Payment amount was not received.'
    );
  }

  // ========================================
  // RAZORPAY PUBLIC KEY
  // ========================================

  const razorpayKey =
    process.env
      .NEXT_PUBLIC_RAZORPAY_KEY_ID;

  if (!razorpayKey) {
    throw new Error(
      'Razorpay public key is missing. Please check Vercel Environment Variables.'
    );
  }

  // ========================================
  // RAZORPAY OPTIONS
  // ========================================

  const options = {
    key: razorpayKey,

    amount: Number(
      orderData.amount
    ),

    currency:
      orderData.currency || 'INR',

    name:
      'SR INTERNET Online Centre',

    description:
      `Digital File - ${selectedPdf.name}`,

    order_id:
      orderData.orderId,

    theme: {
      color: '#2563eb',
    },

    handler: async function (
      response
    ) {
      // ==================================
      // PREVENT DUPLICATE DOWNLOAD
      // ==================================

      if (
        downloadStartedRef.current
      ) {
        return;
      }

      downloadStartedRef.current =
        true;

      setLoading(true);

      try {
        // =================================
        // VERIFY PAYMENT
        // =================================

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
                  selectedPdf.id,
              }),
            }
          );

        // =================================
        // VERIFY RESPONSE
        // =================================

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
            // Ignore JSON error
          }

          throw new Error(
            errorMessage
          );
        }

        // =================================
        // CHECK CONTENT TYPE
        // =================================

        const contentType =
          verifyResponse.headers.get(
            'content-type'
          ) || '';

        if (
          !contentType.includes(
            'application/pdf'
          ) &&
          !contentType.includes(
            'application/octet-stream'
          )
        ) {
          let serverMessage =
            'Server did not return the purchased file.';

          try {
            const text =
              await verifyResponse.text();

            if (text) {
              try {
                const json =
                  JSON.parse(text);

                serverMessage =
                  json?.error ||
                  serverMessage;
              } catch {
                // Ignore
              }
            }
          } catch {
            // Ignore
          }

          throw new Error(
            serverMessage
          );
        }

        // =================================
        // GET FILE
        // =================================

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

        // =================================
        // CREATE OBJECT URL
        // =================================

        const url =
          window.URL.createObjectURL(
            blob
          );

        setPdfUrl(url);

        // =================================
        // FILE NAME
        // =================================

        const extension =
          getExtension(
            selectedPdf.file
          );

        const baseName =
          selectedPdf.file.replace(
            /\.[^/.]+$/,
            ''
          );

        const finalFileName =
          `${baseName}-payment-${response.razorpay_payment_id}${extension}`;

        setDownloadFileName(
          finalFileName
        );

        // =================================
        // AUTOMATIC DOWNLOAD
        // =================================

        const downloadSuccess =
          startDownload(
            url,
            finalFileName
          );

        // =================================
        // PAYMENT SUCCESS
        // =================================

        if (downloadSuccess) {
          setSuccessMessage(
            'Payment Successful! Your payment has been received and your file download has started.'
          );
        } else {
          setSuccessMessage(
            'Payment Successful! Your payment has been received. Please use the Open File button below.'
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

  // ========================================
  // CREATE RAZORPAY INSTANCE
  // ========================================

  const razorpay =
    new window.Razorpay(
      options
    );

  // ========================================
  // PAYMENT FAILED
  // ========================================

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
        response?.error
          ?.description ||
          'Payment failed. Please try again.'
      );
    }
  );

  // ========================================
  // OPEN RAZORPAY
  // ========================================

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

// ==========================================
// PAGE UI
// ==========================================

return (
<main
style={{
minHeight: '100vh',
background: '#f3f6fb',
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
      padding: '30px 20px',
      textAlign: 'center',
    }}
  >
    <h1
      style={{
        margin: 0,
        fontSize: '32px',
        fontWeight: '700',
      }}
    >
      SR INTERNET Online Centre
    </h1>

    <p
      style={{
        marginTop: '8px',
        marginBottom: 0,
        fontSize: '17px',
      }}
    >
      Digital PDF & Online Services
    </p>
  </header>

  {/* ========================================
      MAIN CONTENT
  ======================================== */}

  <div
    style={{
      maxWidth: '900px',
      margin: '0 auto',
      padding:
        '25px 15px 40px',
    }}
  >

    {/* ======================================
        INTRO
    ====================================== */}

    <section
      style={{
        background: 'white',
        borderRadius: '14px',
        padding: '25px',
        marginBottom: '20px',
        boxShadow:
          '0 4px 15px rgba(0,0,0,0.08)',
      }}
    >
      <h2
        style={{
          marginTop: 0,
          color: '#1e3a8a',
        }}
      >
        Online Digital Documents
      </h2>

      <p
        style={{
          lineHeight: '1.7',
          color: '#374151',
        }}
      >
        Select the required file,
        make a secure online payment,
        and download your file instantly.
      </p>

      <p
        style={{
          lineHeight: '1.7',
          color: '#059669',
          fontWeight: '600',
          marginBottom: 0,
        }}
      >
        PDF, Excel and other digital
        files are available for online
        purchase.
      </p>
    </section>

    {/* ======================================
        SEARCH BAR
        LIGHT ORANGE + CENTER
    ====================================== */}

    <section
      style={{
        marginBottom: '20px',
        display: 'flex',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '650px',
        }}
      >
        <input
          type="text"
          placeholder="🔍 Search PDF / Excel file..."
          value={search}
          onChange={(e) =>
            setSearch(e.target.value)
          }
          style={{
            width: '100%',
            boxSizing: 'border-box',
            padding: '15px 18px',
            borderRadius: '12px',
            border:
              '2px solid #fdba74',
            fontSize: '16px',
            outline: 'none',
            background: '#ffedd5',
            color: '#7c2d12',
            textAlign: 'center',
            boxShadow:
              '0 3px 10px rgba(234,88,12,0.12)',
          }}
        />
      </div>
    </section>

    {/* ======================================
        AVAILABLE FILES
    ====================================== */}

    <section
      style={{
        background: '#dcfce7',
        borderRadius: '14px',
        padding: '20px',
        marginBottom: '20px',
      }}
    >
      <h2
        style={{
          marginTop: 0,
          color: '#166534',
        }}
      >
        Available Files
      </h2>

      {filteredPdfs.length === 0 ? (
        <p
          style={{
            color: '#374151',
          }}
        >
          No files found.
        </p>
      ) : (
        filteredPdfs.map((pdf) => (
          <div
            key={pdf.id}
            onClick={() =>
              handleSelectFile(pdf)
            }
            style={{
              background:
                selectedPdf?.id === pdf.id
                  ? '#bbf7d0'
                  : 'white',

              border:
                selectedPdf?.id === pdf.id
                  ? '2px solid #16a34a'
                  : '1px solid #d1d5db',

              borderRadius: '10px',

              padding: '15px',

              marginBottom: '10px',

              cursor: 'pointer',

              display: 'flex',

              justifyContent:
                'space-between',

              alignItems: 'center',

              gap: '10px',
            }}
          >
            <div
              style={{
                minWidth: 0,
              }}
            >
              <strong
                style={{
                  color: '#111827',
                  fontSize: '16px',
                }}
              >
                {pdf.name}
              </strong>

              <div
                style={{
                  marginTop: '5px',
                  fontSize: '13px',
                  color: '#6b7280',
                  wordBreak:
                    'break-word',
                }}
              >
                {getFileType(
                  pdf.file
                )}{' '}
                • {pdf.file}
              </div>
            </div>

            <strong
              style={{
                color: '#166534',
                whiteSpace:
                  'nowrap',
                fontSize: '17px',
              }}
            >
              ₹{pdf.price}
            </strong>
          </div>
        ))
      )}
    </section>

    {/* ======================================
        SELECTED FILE
    ====================================== */}

    {selectedPdf && (
      <section
        style={{
          background: 'white',
          borderRadius: '14px',
          padding: '25px',
          marginBottom: '20px',
          boxShadow:
            '0 4px 15px rgba(0,0,0,0.08)',
          textAlign: 'center',
        }}
      >

        <h2
          style={{
            marginTop: 0,
            color: '#1e3a8a',
            marginBottom: '8px',
          }}
        >
          {selectedPdf.name}
        </h2>

        <p
          style={{
            color: '#6b7280',
            wordBreak:
              'break-word',
          }}
        >
          {getFileType(
            selectedPdf.file
          )}{' '}
          File
          <br />
          {selectedPdf.file}
        </p>

        {/* PRICE */}

        <div
          style={{
            fontSize: '30px',
            fontWeight: '700',
            color: '#059669',
            margin:
              '15px 0 20px',
          }}
        >
          ₹{selectedPdf.price}
        </div>

        {/* PAYMENT BUTTON */}

        <button
          onClick={handlePayment}
          disabled={loading}
          style={{
            width: '100%',
            maxWidth: '450px',
            padding: '15px',
            border: 'none',
            borderRadius: '10px',
            background:
              loading
                ? '#9ca3af'
                : '#2563eb',
            color: 'white',
            fontSize: '17px',
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

        {/* ==================================
            PAYMENT SUCCESS
        ================================== */}

        {successMessage && (
          <div
            style={{
              marginTop: '20px',
              padding: '20px',
              background:
                '#dcfce7',
              border:
                '2px solid #16a34a',
              borderRadius: '10px',
              textAlign: 'center',
            }}
          >

            {/* SUCCESS TITLE */}

            <div
              style={{
                fontSize: '22px',
                fontWeight: '700',
                color: '#166534',
                marginBottom: '8px',
              }}
            >
              ✅ Payment Successful
            </div>

            {/* SUCCESS MESSAGE */}

            <div
              style={{
                color: '#166534',
                fontSize: '15px',
                lineHeight: '1.6',
              }}
            >
              Your payment has been
              received successfully.
              <br />
              Your file download has
              started.
            </div>

            {/* =================================
                OPEN FILE + DOWNLOAD AGAIN
            ================================= */}

            {pdfUrl && (
              <div
                style={{
                  marginTop: '15px',
                }}
              >

                {/* OPEN FILE */}

                <a
                  href={pdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display:
                      'inline-block',
                    padding:
                      '12px 25px',
                    background:
                      '#16a34a',
                    color: 'white',
                    textDecoration:
                      'none',
                    borderRadius:
                      '8px',
                    fontWeight:
                      '700',
                    fontSize:
                      '16px',
                    margin:
                      '5px',
                  }}
                >
                  📄 Open File
                </a>

                {/* DOWNLOAD AGAIN */}

                <a
                  href={pdfUrl}
                  download={
                    downloadFileName ||
                    'downloaded-file'
                  }
                  style={{
                    display:
                      'inline-block',
                    padding:
                      '12px 25px',
                    background:
                      '#2563eb',
                    color: 'white',
                    textDecoration:
                      'none',
                    borderRadius:
                      '8px',
                    fontWeight:
                      '700',
                    fontSize:
                      '16px',
                    margin:
                      '5px',
                  }}
                >
                  ⬇️ Download Again
                </a>
              </div>
            )}
          </div>
        )}
      </section>
    )}

    {/* ======================================
        ABOUT
    ====================================== */}

    <section
      style={{
        background: 'white',
        borderRadius: '14px',
        padding: '25px',
        marginBottom: '20px',
      }}
    >
      <h2
        style={{
          color: '#1e3a8a',
          marginTop: 0,
        }}
      >
        About SR E-Print Online
      </h2>

      <p
        style={{
          lineHeight: '1.7',
          color: '#374151',
        }}
      >
        SR E-Print Online provides
        digital documents and online
        services through secure online
        payment and digital delivery.
      </p>
    </section>

    {/* ======================================
        SERVICES
    ====================================== */}

    <section
      style={{
        background: 'white',
        borderRadius: '14px',
        padding: '25px',
        marginBottom: '20px',
      }}
    >
      <h2
        style={{
          color: '#1e3a8a',
          marginTop: 0,
        }}
      >
        Our Services
      </h2>

      <ul
        style={{
          lineHeight: '2',
          color: '#374151',
        }}
      >
        <li>Digital PDF Documents</li>
        <li>Excel Files</li>
        <li>Online Document Services</li>
        <li>Secure Online Payment</li>
        <li>Instant Digital Delivery</li>
      </ul>
    </section>

    {/* ======================================
        HOW IT WORKS
    ====================================== */}

    <section
      style={{
        background: 'white',
        borderRadius: '14px',
        padding: '25px',
        marginBottom: '20px',
      }}
    >
      <h2
        style={{
          color: '#1e3a8a',
          marginTop: 0,
        }}
      >
        How It Works
      </h2>

      <ol
        style={{
          lineHeight: '2',
          color: '#374151',
        }}
      >
        <li>
          Select the required file.
        </li>

        <li>
          Check the displayed price.
        </li>

        <li>
          Click the payment button.
        </li>

        <li>
          Complete payment through
          Razorpay.
        </li>

        <li>
          Payment is securely verified.
        </li>

        <li>
          Your purchased file starts
          downloading automatically.
        </li>

        <li>
          If automatic download is
          blocked, use Open File or
          Download Again.
        </li>
      </ol>
    </section>

    {/* ======================================
        PAYMENT & DELIVERY
    ====================================== */}

    <section
      style={{
        background: 'white',
        borderRadius: '14px',
        padding: '25px',
        marginBottom: '20px',
      }}
    >
      <h2
        style={{
          color: '#1e3a8a',
          marginTop: 0,
        }}
      >
        Payment & Digital Delivery
      </h2>

      <p
        style={{
          lineHeight: '1.7',
          color: '#374151',
        }}
      >
        Payments are processed securely
        through Razorpay. After successful
        payment verification, the selected
        digital file is delivered
        electronically.
      </p>

      <p
        style={{
          lineHeight: '1.7',
          color: '#374151',
        }}
      >
        No physical shipping is involved.
        All products available on this
        website are digital files.
      </p>
    </section>

    {/* ======================================
        CONTACT
    ====================================== */}

    <section
      style={{
        background: 'white',
        borderRadius: '14px',
        padding: '25px',
        marginBottom: '20px',
      }}
    >
      <h2
        style={{
          color: '#1e3a8a',
          marginTop: 0,
        }}
      >
        Contact Us
      </h2>

      <p
        style={{
          lineHeight: '1.8',
          color: '#374151',
        }}
      >
        <strong>
          SR E-Print Online
        </strong>

        <br />

        Phone / WhatsApp:
        9989057683

        <br />

        Email:
        sronline99890@gmail.com
      </p>
    </section>

    {/* ======================================
        POLICY LINKS
    ====================================== */}

    <section
      style={{
        background: 'white',
        borderRadius: '14px',
        padding: '20px',
        marginBottom: '20px',
        textAlign: 'center',
      }}
    >
      <h3
        style={{
          marginTop: 0,
          color: '#1e3a8a',
        }}
      >
        Important Information
      </h3>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent:
            'center',
          gap: '10px',
        }}
      >

        <a
          href="/privacy"
          style={{
            color: '#2563eb',
            textDecoration:
              'none',
            fontWeight: '600',
          }}
        >
          Privacy Policy
        </a>

        <span>|</span>

        <a
          href="/refund"
          style={{
            color: '#2563eb',
            textDecoration:
              'none',
            fontWeight: '600',
          }}
        >
          Refund / Cancellation
        </a>

        <span>|</span>

        <a
          href="/terms"
          style={{
            color: '#2563eb',
            textDecoration:
              'none',
            fontWeight: '600',
          }}
        >
          Terms & Conditions
        </a>

        <span>|</span>

        <a
          href="/shipping"
          style={{
            color: '#2563eb',
            textDecoration:
              'none',
            fontWeight: '600',
          }}
        >
          Shipping / Delivery
        </a>

      </div>
    </section>

    {/* ======================================
        FOOTER
    ====================================== */}

    <footer
      style={{
        textAlign: 'center',
        padding:
          '25px 15px',
        color: '#6b7280',
        fontSize: '14px',
        background: 'white',
        borderRadius: '14px',
      }}
    >

      <div
        style={{
          marginBottom:
            '12px',
        }}
      >

        <a
          href="/privacy"
          style={{
            margin: '0 6px',
            color: '#2563eb',
            textDecoration:
              'none',
          }}
        >
          Privacy
        </a>

        <a
          href="/refund"
          style={{
            margin: '0 6px',
            color: '#2563eb',
            textDecoration:
              'none',
          }}
        >
          Refund
        </a>

        <a
          href="/terms"
          style={{
            margin: '0 6px',
            color: '#2563eb',
            textDecoration:
              'none',
          }}
        >
          Terms
        </a>

        <a
          href="/shipping"
          style={{
            margin: '0 6px',
            color: '#2563eb',
            textDecoration:
              'none',
          }}
        >
          Delivery
        </a>

      </div>

      <div>
        © 2026 SR E-Print Online.
        All Rights Reserved.
      </div>

    </footer>

  </div>

  {/* ========================================
      WHATSAPP BUTTON
  ======================================== */}

  <a
    href="https://wa.me/919989057683"
    target="_blank"
    rel="noopener noreferrer"
    style={{
      position: 'fixed',
      right: '20px',
      bottom: '20px',
      width: '55px',
      height: '55px',
      borderRadius: '50%',
      background: '#25D366',
      color: 'white',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      textDecoration: 'none',
      fontSize: '27px',
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
