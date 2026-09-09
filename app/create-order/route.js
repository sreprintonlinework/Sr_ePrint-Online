import { NextResponse } from 'next/server';
import { pdfs } from '../pdfs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request) {
  try {
    const body = await request.json();

    const pdfId = body?.pdfId;

    // ==========================================
    // CHECK PDF ID
    // ==========================================

    if (!pdfId) {
      return NextResponse.json(
        {
          error: 'PDF ID is required.',
        },
        { status: 400 }
      );
    }

    // ==========================================
    // FIND PDF
    // ==========================================

    const selectedPdf = pdfs.find(
      (pdf) => String(pdf.id) === String(pdfId)
    );

    if (!selectedPdf) {
      return NextResponse.json(
        {
          error: 'Selected PDF not found.',
        },
        { status: 404 }
      );
    }

    // ==========================================
    // RAZORPAY ENVIRONMENT VARIABLES
    // ==========================================

    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!keyId || !keySecret) {
      console.error(
        'Razorpay environment variables are missing.'
      );

      return NextResponse.json(
        {
          error:
            'Razorpay payment configuration is missing.',
        },
        { status: 500 }
      );
    }

    // ==========================================
    // PRICE
    // ==========================================

    const price = Number(selectedPdf.price);

    if (!Number.isFinite(price) || price <= 0) {
      return NextResponse.json(
        {
          error: 'Invalid PDF price configuration.',
        },
        { status: 500 }
      );
    }

    // Convert INR to paise
    // ₹99 = 9900
    // ₹20 = 2000

    const amount = Math.round(price * 100);

    // ==========================================
    // RAZORPAY BASIC AUTH
    // ==========================================

    const auth = Buffer.from(
      `${keyId}:${keySecret}`
    ).toString('base64');

    // ==========================================
    // CREATE RAZORPAY ORDER
    // ==========================================

    const response = await fetch(
      'https://api.razorpay.com/v1/orders',
      {
        method: 'POST',

        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${auth}`,
        },

        body: JSON.stringify({
          amount,
          currency: 'INR',

          receipt:
            `pdf_${selectedPdf.id}_${Date.now()}`,

          notes: {
            pdfId: String(selectedPdf.id),
            pdfName: String(selectedPdf.name || ''),
            price: String(price),
          },
        }),

        cache: 'no-store',
      }
    );

    const data = await response.json();

    // ==========================================
    // RAZORPAY ERROR
    // ==========================================

    if (!response.ok) {
      console.error(
        'Razorpay order creation failed:',
        data
      );

      return NextResponse.json(
        {
          error:
            data?.error?.description ||
            'Failed to create Razorpay order.',
        },
        { status: 400 }
      );
    }

    // ==========================================
    // CHECK ORDER ID
    // ==========================================

    if (!data?.id) {
      console.error(
        'Razorpay order ID missing:',
        data
      );

      return NextResponse.json(
        {
          error:
            'Razorpay Order ID was not received.',
        },
        { status: 500 }
      );
    }

    console.log(
      'Razorpay order created:',
      data.id
    );

    // ==========================================
    // SUCCESS
    // ==========================================

    return NextResponse.json(
      {
        orderId: data.id,
        amount: data.amount,
        currency: data.currency,
        pdfId: String(selectedPdf.id),
        pdfName: selectedPdf.name,
        price,
      },
      { status: 200 }
    );

  } catch (error) {
    console.error(
      'CREATE ORDER ERROR:',
      error
    );

    return NextResponse.json(
      {
        error:
          error?.message ||
          'Something went wrong while creating the payment order.',
      },
      { status: 500 }
    );
  }
}
