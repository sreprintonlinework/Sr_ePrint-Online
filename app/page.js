"use client";
import { useState } from "react";
import { pdfs } from "./pdfs.js";

export default function Home() {
  const [search, setSearch] = useState("");
  const [selectedPdf, setSelectedPdf] = useState(null);
  const [loading, setLoading] = useState(false);

  const filteredPdfs = pdfs.filter((pdf) =>
    pdf.name.toLowerCase().includes(search.toLowerCase())
  );

  const handlePay = async () => {
    if (!selectedPdf) return;
    setLoading(true);

    // ఇక్కడే మీరు పెట్టిన Price వెళ్తుంది
    const res = await fetch("/api/create-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        amount: selectedPdf.price,
        pdfName: selectedPdf.name 
      }),
    });

    const order = await res.json();

    const options = {
      key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
      amount: order.amount,
      currency: "INR",
      name: "SR INTERNET Online Centre",
      description: selectedPdf.name,
      order_id: order.id,
      handler: async function (response) {
        const verifyRes = await fetch("/api/verify-payment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...response,
            pdfFile: selectedPdf.file,
          }),
        });
        const data = await verifyRes.json();
        if (data.success) {
          window.location.href = `/api/download?file=${selectedPdf.file}`;
        }
      },
      theme: { color: "#0b57d0" },
    };

    const rzp = new window.Razorpay(options);
    rzp.open();
    setLoading(false);
  };

  return (
    <div style={{ background: "#f3f6fb", minHeight: "100vh", paddingBottom: "20px" }}>
      {/* Header */}
      <div style={{ background: "#0b57d0", padding: "25px", textAlign: "center", color: "white" }}>
        <h1 style={{ margin: 0 }}>SR INTERNET Online Centre</h1>
        <p>Digital PDF & Online Services</p>
      </div>

      <div style={{ padding: "15px" }}>
        <div style={{ background: "white", padding: "15px", borderRadius: "12px", textAlign: "center", marginBottom: "15px" }}>
          <h2 style={{ margin: "0 0 10px 0" }}>Online PDF Downloads</h2>
          <p style={{ color: "#666", fontSize: "14px" }}>
            Select the required PDF, make a secure payment and download instantly.
          </p>
        </div>

        {/* Search - Bold Cursor */}
        <input
          type="text"
          placeholder="🔍 Search PDF Name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: "80%",
            display: "block",
            margin: "0 auto 15px auto",
            padding: "16px",
            fontSize: "18px",
            border: "1px solid #d5dbe3",
            borderRadius: "12px",
            outline: "none",
            textAlign: "center",
            background: "#FFE5B4",
            fontWeight: "bold",
            caretColor: "black",
          }}
        />

        {/* PDF List */}
        <div style={{ background: "#e8f1ff", padding: "12px", borderRadius: "12px" }}>
          <h3>Available PDFs</h3>
          {filteredPdfs.map((pdf) => (
            <div
              key={pdf.id}
              onClick={() => setSelectedPdf(pdf)}
              style={{
                background: "white",
                padding: "12px",
                borderRadius: "10px",
                marginBottom: "10px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                border: selectedPdf?.id === pdf.id ? "2px solid #0b57d0" : "1px solid #ddd",
                cursor: "pointer",
              }}
            >
              <div>
                <div style={{ fontWeight: "bold" }}>{pdf.name}</div>
                <div style={{ fontSize: "12px", color: "#666" }}>PDF Document</div>
              </div>
              <div style={{ fontWeight: "bold", color: "#0b57d0" }}>₹{pdf.price}</div>
            </div>
          ))}
        </div>

        {/* Selected & Pay */}
        {selectedPdf && (
          <div style={{ background: "white", padding: "15px", borderRadius: "12px", marginTop: "15px", textAlign: "center" }}>
            <p style={{ margin: 0, color: "#666" }}>Selected PDF</p>
            <h3 style={{ margin: "5px 0" }}>{selectedPdf.name}</h3>
            <h2 style={{ color: "#0b57d0" }}>₹{selectedPdf.price}</h2>
            <button
              onClick={handlePay}
              disabled={loading}
              style={{
                width: "100%",
                padding: "15px",
                background: "#0b57d0",
                color: "white",
                border: "none",
                borderRadius: "12px",
                fontSize: "16px",
                fontWeight: "bold",
                marginTop: "10px",
                cursor: "pointer",
              }}
            >
              💳 Pay ₹{selectedPdf.price} & Download PDF
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
