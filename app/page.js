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

  const filteredPdfs = [...pdfs]
   .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
   .filter((pdf) => pdf.name.toLowerCase().includes(search.toLowerCase()));

  const getExtension = (fileName) => {
    if (!fileName) return '';
    const parts = fileName.split('.');
    if (parts.length < 2) return '';
    return '.' + parts[parts.length - 1].toLowerCase();
  };

  const getFileType = (fileName) => {
    const extension = getExtension(fileName);
    switch (extension) {
      case '.pdf': return 'PDF';
      case '.xls':
      case '.xlsx': return 'Excel';
      case '.doc':
      case '.docx': return 'Word';
      case '.jpg':
      case '.jpeg':
      case '.png': return 'Image';
      case '.txt': return 'Text';
      default: return 'Digital File';
    }
  };

  const loadRazorpayScript = () => {
    return new Promise((resolve) => {
      if (typeof window === 'undefined') { resolve(false); return; }
      if (window.Razorpay) { resolve(true); return; }
      const scriptUrl = 'https://checkout.razorpay.com/v1/checkout.js';
      const existingScript = document.querySelector(`script[src="${scriptUrl}"]`);
      if (existingScript) {
        existingScript.addEventListener('load', () => resolve(true), { once: true });
        existingScript.addEventListener('error', () => resolve(false), { once: true });
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

  const handleSelectFile = (pdf) => {
    setSelectedPdf(pdf);
    setSuccessMessage('');
    setDownloadFileName('');
    if (pdfUrl) window.URL.revokeObjectURL(pdfUrl);
    setPdfUrl('');
    downloadStartedRef.current = false;
  };

  const startDownload = (url, fileName) => {
    try {
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      setTimeout(() => link.remove(), 1500);
      return true;
    } catch (error) {
      console.error('AUTO DOWNLOAD ERROR:', error);
      return false;
    }
  };

  const handlePrint = () => {
    if (!pdfUrl) return;
    const printWindow = window.open(pdfUrl, '_blank');
    if (printWindow) {
      printWindow.onload = () => {
        setTimeout(() => {
          printWindow.print();
        }, 500);
      };
    } else {
      alert('Please allow popups to print the file.');
    }
  };

  const handlePayment = async () => {
    if (!selectedPdf) { alert('Please select a file first.'); return; }
    if (paymentStartedRef.current) return;

    paymentStartedRef.current = true;
    downloadStartedRef.current = false;
    setLoading(true);
    setSuccessMessage('');
    setDownloadFileName('');
    if (pdfUrl) window.URL.revokeObjectURL(pdfUrl);
    setPdfUrl('');

    try {
      const razorpayLoaded = await loadRazorpayScript();
      if (!razorpayLoaded) throw new Error('Razorpay could not be loaded. Please check your internet connection and try again.');

      const orderResponse = await fetch('/api/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdfId: selectedPdf.id }),
      });

      let orderData;
      try { orderData = await orderResponse.json(); }
      catch { throw new Error('Invalid server response while creating payment order.'); }

      if (!orderResponse.ok) throw new Error(orderData?.error || 'Unable to create payment order.');
      if (!orderData?.orderId) throw new Error('Razorpay Order ID was not received.');
      if (orderData?.amount === undefined || orderData?.amount === null) throw new Error('Payment amount was not received.');

      const razorpayKey = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
      if (!razorpayKey) throw new Error('Razorpay public key is missing. Please check Vercel Environment Variables.');

      const options = {
        key: razorpayKey,
        amount: Number(orderData.amount),
        currency: orderData.currency || 'INR',
        name: 'SR E-Print Online',
        description: `Digital File - ${selectedPdf.name}`,
        order_id: orderData.orderId,
        theme: { color: '#0b5fff' },
        modal: {
          ondismiss: function () {
            setLoading(false);
            paymentStartedRef.current = false;
            downloadStartedRef.current = false;
          },
        },
        handler: async function (response) {
          if (downloadStartedRef.current) return;
          downloadStartedRef.current = true;
          setLoading(true);
          try {
            const verifyResponse = await fetch('/api/verify-payment', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                pdfId: selectedPdf.id,
              }),
            });

            const contentType = verifyResponse.headers.get('content-type') || '';
            if (!verifyResponse.ok) {
              let errorMessage = 'Payment verification failed.';
              try { const errorData = await verifyResponse.json(); errorMessage = errorData?.error || errorMessage; } catch {}
              throw new Error(errorMessage);
            }
            if (contentType.toLowerCase().includes('application/json')) {
              let serverMessage = 'Server did not return the purchased file.';
              try { const json = await verifyResponse.json(); serverMessage = json?.error || serverMessage; } catch {}
              throw new Error(serverMessage);
            }

            const blob = await verifyResponse.blob();
            if (!blob || blob.size === 0) throw new Error('The purchased file is empty.');

            const url = window.URL.createObjectURL(blob);
            setPdfUrl(url);
            const extension = getExtension(selectedPdf.file);
            const baseName = selectedPdf.file.replace(/\.[^/.]+$/, '');
            const finalFileName = `${baseName}-payment-${response.razorpay_payment_id}${extension}`;
            setDownloadFileName(finalFileName);
            const downloadSuccess = startDownload(url, finalFileName);

            if (downloadSuccess) {
              setSuccessMessage('Payment Successful! Your file download has started. You can also Print it.');
            } else {
              setSuccessMessage('Payment Successful! Please use Download Again or Print button.');
            }
            setLoading(false);
            paymentStartedRef.current = false;
          } catch (error) {
            console.error('DOWNLOAD / VERIFY ERROR:', error);
            setSuccessMessage('');
            alert(error?.message || 'Payment was received, but file download failed. Please contact support.');
            setLoading(false);
            paymentStartedRef.current = false;
            downloadStartedRef.current = false;
          }
        },
      };

      const razorpay = new window.Razorpay(options);
      razorpay.on('payment.failed', function (response) {
        console.error('RAZORPAY PAYMENT FAILED:', response);
        setLoading(false);
        paymentStartedRef.current = false;
        downloadStartedRef.current = false;
        alert(response?.error?.description || 'Payment failed. Please try again.');
      });
      razorpay.open();
    } catch (error) {
      console.error('PAYMENT ERROR:', error);
      alert(error?.message || 'Something went wrong. Please try again.');
      setLoading(false);
      paymentStartedRef.current = false;
      downloadStartedRef.current = false;
    }
  };

  return (
    <main style={{ minHeight: '100vh', background: '#f3f6fb', fontFamily: 'Arial, sans-serif' }}>
      <header style={{ background: 'linear-gradient(135deg, #2563eb, #1d4ed8)', color: 'white', padding: '24px 15px', textAlign: 'center' }}>
        <h1 style={{ margin: 0, fontSize: '30px', fontWeight: '700' }}>SR E-Print Online</h1>
        <p style={{ marginTop: '5px', marginBottom: 0, fontSize: '16px' }}>Digital PDF & Excel Files</p>
      </header>

      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '18px 12px 30px' }}>
        <section style={{ background: 'white', borderRadius: '12px', padding: '18px 20px', marginBottom: '12px', boxShadow: '0 3px 12px rgba(0,0,0,0.06)' }}>
          <h2 style={{ margin: '0 0 7px 0', color: '#1e3a8a', fontSize: '23px' }}>Digital File Store</h2>
          <p style={{ lineHeight: '1.5', color: '#374151', margin: '5px 0' }}>Select the required digital file, make a secure online payment, and receive your purchased file electronically.</p>
          <p style={{ lineHeight: '1.5', color: '#059669', fontWeight: '600', margin: '5px 0 0' }}>PDF, Excel and other digital files are available for online purchase.</p>
        </section>

        {successMessage && pdfUrl && (
          <section style={{ background: '#dcfce7', border: '2px solid #16a34a', borderRadius: '12px', padding: '16px', marginBottom: '12px', textAlign: 'center', boxShadow: '0 3px 10px rgba(22,163,74,0.10)' }}>
            <div style={{ fontSize: '21px', fontWeight: '700', color: '#166534', marginBottom: '5px' }}>✅ Payment Successful</div>
            <div style={{ color: '#166534', fontSize: '14px', lineHeight: '1.45', marginBottom: '8px' }}>{successMessage}<br />Your purchased file is ready.</div>
            {downloadFileName && <div style={{ color: '#14532d', fontSize: '13px', marginBottom: '8px', wordBreak: 'break-word' }}>📄 {downloadFileName}</div>}
            <div>
              <a href={pdfUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', padding: '10px 20px', background: '#16a34a', color: 'white', textDecoration: 'none', borderRadius: '8px', fontWeight: '700', fontSize: '15px', margin: '3px' }}>📄 Open File</a>
              <a href={pdfUrl} download={downloadFileName || 'downloaded-file'} style={{ display: 'inline-block', padding: '10px 20px', background: '#2563eb', color: 'white', textDecoration: 'none', borderRadius: '8px', fontWeight: '700', fontSize: '15px', margin: '3px' }}>⬇️ Download Again</a>
              <button onClick={handlePrint} style={{ display: 'inline-block', padding: '10px 20px', background: '#4b5563', color: 'white', border: 'none', borderRadius: '8px', fontWeight: '700', fontSize: '15px', margin: '3px', cursor: 'pointer' }}>🖨️ Print File</button>
            </div>
          </section>
        )}

        <section style={{ marginBottom: '12px', display: 'flex', justifyContent: 'center' }}>
          <div style={{ width: '100%', maxWidth: '650px' }}>
            <input type="text" placeholder="🔍 Search digital file..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', padding: '13px 16px', borderRadius: '10px', border: '2px solid #fdba74', fontSize: '16px', outline: 'none', background: '#ffedd5', color: '#7c2d12', textAlign: 'center', boxShadow: '0 2px 8px rgba(234,88,12,0.10)' }} />
          </div>
        </section>

        <section style={{ background: '#dcfce7', borderRadius: '12px', padding: '16px', marginBottom: '12px' }}>
          <h2 style={{ margin: '0 0 12px 0', color: '#166534', fontSize: '22px' }}>Available Files</h2>
          {filteredPdfs.length === 0? <p style={{ color: '#374151', margin: '5px 0' }}>No files found.</p> : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '8px' }}>
              {filteredPdfs.map((pdf) => (
                <div key={pdf.id} onClick={() => handleSelectFile(pdf)} style={{ background: selectedPdf?.id === pdf.id? '#bbf7d0' : 'white', border: selectedPdf?.id === pdf.id? '2px solid #16a34a' : '1px solid #d1d5db', borderRadius: '9px', padding: '11px 12px', cursor: 'pointer', minWidth: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '7px' }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <strong style={{ color: '#111827', fontSize: '14px', display: 'block', wordBreak: 'break-word' }}>{pdf.name}</strong>
                    <div style={{ marginTop: '3px', fontSize: '11px', color: '#6b7280', wordBreak: 'break-word', lineHeight: '1.35' }}>{getFileType(pdf.file)} • {pdf.file}</div>
                  </div>
                  <strong style={{ color: '#166534', whiteSpace: 'nowrap', fontSize: '15px' }}>₹{pdf.price}</strong>
                </div>
              ))}
            </div>
          )}
        </section>

        {selectedPdf && (
          <section style={{ background: 'white', borderRadius: '12px', padding: '20px 18px', marginBottom: '12px', boxShadow: '0 3px 12px rgba(0,0,0,0.06)', textAlign: 'center' }}>
            <h2 style={{ margin: '0 0 6px 0', color: '#1e3a8a', fontSize: '22px', wordBreak: 'break-word' }}>{selectedPdf.name}</h2>
            <p style={{ color: '#6b7280', wordBreak: 'break-word', lineHeight: '1.4', margin: '5px 0' }}>{getFileType(selectedPdf.file)} File<br />{selectedPdf.file}</p>
            <div style={{ fontSize: '30px', fontWeight: '800', color: '#059669', margin: '12px 0 16px' }}>₹{selectedPdf.price}</div>
            <button onClick={handlePayment} disabled={loading} style={{ width: '100%', maxWidth: '500px', minHeight: '60px', padding: '18px 15px', border: 'none', borderRadius: '13px', background: loading? '#9ca3af' : '#0b5fff', color: 'white', fontSize: '20px', fontWeight: '800', cursor: loading? 'not-allowed' : 'pointer', boxShadow: loading? 'none' : '0 5px 14px rgba(11,95,255,0.28)' }}>
              {loading? '⏳ Processing Payment...' : `💳 Pay ₹${selectedPdf.price} with PhonePe / GPay`}
            </button>
            <div style={{ marginTop: '10px', fontSize: '13px', color: '#6b7280' }}>Secure payment powered by Razorpay • App Model Checkout</div>
          </section>
        )}

        <section style={{ background: 'white', borderRadius: '12px', padding: '18px', marginBottom: '12px' }}>
          <h2 style={{ color: '#1e3a8a', margin: '0 0 7px 0', fontSize: '21px' }}>About SR E-Print Online</h2>
          <p style={{ lineHeight: '1.5', color: '#374151', margin: '5px 0' }}>SR E-Print Online provides digital files such as PDF and Excel files through online purchase and electronic delivery.</p>
        </section>

        <section style={{ background: 'white', borderRadius: '12px', padding: '18px', marginBottom: '12px' }}>
          <h2 style={{ color: '#1e3a8a', margin: '0 0 7px 0', fontSize: '21px' }}>Digital Products</h2>
          <ul style={{ lineHeight: '1.7', color: '#374151', marginTop: '5px', marginBottom: '
