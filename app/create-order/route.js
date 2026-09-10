import { NextResponse } from 'next/server';
import { pdfs } from '../../pdfs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request) {
  try {
    // ==========================================
    // 1. READ REQUEST
    // ==========================================

    const body = await request.json();

    const pdfId = body?.pdfId;

    // ==========================================
    // 2. CHECK PDF ID
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
    // 3. FIND SELECTED FILE
    // ==========================================

    const selectedPdf = pdfs.find(
      (pdf) => String(pdf.id) === String(pdfId)
    );

    if (!selectedPdf) {
      return NextResponse.json(
        {
          error: 'Selected PDF/File not found.',
        },
        { status: 404 }
      );
    }

    // ==========================================
    // 4. RAZORPAY KEYS
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
    // 5. DYNAMIC PRICE
    // ==========================================

    const price = Number(selectedPdf.price);

    if (!Number.isFinite(price) || price <= 0) {
      return NextResponse.json(
        {
          error:
            'Invalid file price configuration.',
        },
        { status: 500 }
      );
    }

    // ₹1 = 100 paise
    const amount = Math.round(price * 100);

    // ==========================================
    // 6. RAZORPAY AUTH
    // ==========================================

    const auth = Buffer.from(
      `${keyId}:${keySecret}`
    ).toString('base64');

    // ==========================================
    // 7. CREATE RAZORPAY ORDER
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
          amount: amount,
          currency: 'INR',

          receipt:
            `file_${selectedPdf.id}_${Date.now()}`,

          notes: {
            pdfId: String(selectedPdf.id),
            pdfName: String(
              selectedPdf.name || ''
            ),
            fileName: String(
              selectedPdf.file || ''
            ),
            price: String(price),
          },
        }),

        cache: 'no-store',
      }
    );

    const data = await response.json();

    // ==========================================
    // 8. CHECK RAZORPAY RESPONSE
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
    // 9. CHECK ORDER ID
    // ==========================================

    if (!data?.id) {
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
    // 10. SEND ORDER TO FRONTEND
    // ==========================================

    return NextResponse.json(
      {
        orderId: data.id,
        amount: data.amount,
        currency: data.currency,

        pdfId: String(selectedPdf.id),

        pdfName: selectedPdf.name,

        fileName: selectedPdf.file,

        price: price,
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
