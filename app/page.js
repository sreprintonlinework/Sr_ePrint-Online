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
  useEffect(() => { return () => { if (pdfUrl) window.URL.revokeObjectURL(pdfUrl); }; }, [pdfUrl]);
  const filteredPdfs = [...pdfs].sort((a,b)=>a.name.localeCompare(b.name,undefined,{sensitivity:'base'})).filter((pdf)=>pdf.name.toLowerCase().includes(search.toLowerCase()));
  const getExtension = (f) => { if(!f) return ''; const p=f.split('.'); if(p.length<2) return ''; return '.'+p[p.length-1].toLowerCase(); };
  const getFileType = (f) => { const e=getExtension(f); if(e=='.pdf') return 'PDF'; if(e=='.xls'||e=='.xlsx') return 'Excel'; if(e=='.doc'||e=='.docx') return 'Word'; return 'Digital File'; };
  const loadRazorpayScript = () => { return new Promise((res)=>{ if(window.Razorpay){res(true);return;} const s=document.createElement('script'); s.src='https://checkout.razorpay.com/v1/checkout.js'; s.onload=()=>res(true); s.onerror=()=>res(false); document.body.appendChild(s); }); };
  const handleSelectFile = (pdf) => { setSelectedPdf(pdf); setSuccessMessage(''); if(pdfUrl) window.URL.revokeObjectURL(pdfUrl); setPdfUrl(''); };
  const startDownload = (url,name) => { const a=document.createElement('a'); a.href=url; a.download=name; document.body.appendChild(a); a.click(); setTimeout(()=>a.remove(),1500); return true; };
  const handlePrint = () => { if(!pdfUrl) return; const w=window.open(pdfUrl,'_blank'); if(w){ w.onload=()=>setTimeout(()=>w.print(),500); } };

  const handlePayment = async () => {
    if(!selectedPdf) return alert('Select file');
    if(paymentStartedRef.current) return;
    paymentStartedRef.current=true; setLoading(true);
    try{
      await loadRazorpayScript();
      const orderRes=await fetch('/api/create-order',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pdfId:selectedPdf.id})});
      const orderData=await orderRes.json();
      const key=process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
      const options={
        key:key, amount:Number(orderData.amount), currency:'INR',
        name:'SR E-Print Online', description:selectedPdf.name, order_id:orderData.orderId,
        theme:{color:'#0b5fff'},
        handler: async function(r){
          const verifyRes=await fetch('/api/verify-payment',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({razorpay_order_id:r.razorpay_order_id,razorpay_payment_id:r.razorpay_payment_id,razorpay_signature:r.razorpay_signature,pdfId:selectedPdf.id})});
          const blob=await verifyRes.blob(); const url=window.URL.createObjectURL(blob); setPdfUrl(url);
          const finalName=selectedPdf.file; setDownloadFileName(finalName); startDownload(url,finalName);
          setSuccessMessage('Payment Successful! File ready. You can Print also.'); setLoading(false); paymentStartedRef.current=false;
        },
        modal:{ondismiss:()=>{ setLoading(false); paymentStartedRef.current=false; }}
      };
      new window.Razorpay(options).open();
    }catch(e){ alert(e.message); setLoading(false); paymentStartedRef.current=false; }
  };

  return (
    <main style={{minHeight:'100vh',background:'#f3f6fb'}}>
      <header style={{background:'#2563eb',color:'white',padding:'20px',textAlign:'center'}}><h1>SR E-Print Online</h1></header>
      <div style={{maxWidth:'900px',margin:'0 auto',padding:'15px'}}>
        {successMessage && pdfUrl && (
          <div style={{background:'#dcfce7',border:'2px solid #16a34a',padding:'15px',borderRadius:'10px',textAlign:'center',marginBottom:'10px'}}>
            <div>✅ {successMessage}</div>
            <a href={pdfUrl} target="_blank" style={{margin:'5px',display:'inline-block',padding:'10px 15px',background:'#16a34a',color:'white',borderRadius:'6px',textDecoration:'none'}}>Open</a>
            <a href={pdfUrl} download={downloadFileName} style={{margin:'5px',display:'inline-block',padding:'10px 15px',background:'#2563eb',color:'white',borderRadius:'6px',textDecoration:'none'}}>Download</a>
            <button onClick={handlePrint} style={{margin:'5px',padding:'10px 15px',background:'#4b5563',color:'white',borderRadius:'6px',border:'none'}}>🖨️ Print</button>
          </div>
        )}
        <input type="text" placeholder="Search file..." value={search} onChange={e=>setSearch(e.target.value)} style={{width:'100%',padding:'12px',marginBottom:'10px',borderRadius:'8px'}} />
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px'}}>
          {filteredPdfs.map(pdf=>(
            <div key={pdf.id} onClick={()=>handleSelectFile(pdf)} style={{background:selectedPdf?.id===pdf.id?'#bbf7d0':'white',border:'1px solid #ccc',padding:'10px',borderRadius:'8px',cursor:'pointer'}}>
              <strong>{pdf.name}</strong><br/>₹{pdf.price}
            </div>
          ))}
        </div>
        {selectedPdf && (
          <div style={{background:'white',padding:'20px',marginTop:'15px',textAlign:'center',borderRadius:'10px'}}>
            <h2>{selectedPdf.name}</h2><h2 style={{color:'green'}}>₹{selectedPdf.price}</h2>
            <button onClick={handlePayment} disabled={loading} style={{width:'100%',padding:'15px',background:'#0b5fff',color:'white',border:'none',borderRadius:'10px',fontSize:'18px',fontWeight:'bold'}}>
              {loading?'Processing...':`Pay ₹${selectedPdf.price} with PhonePe / GPay`}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
