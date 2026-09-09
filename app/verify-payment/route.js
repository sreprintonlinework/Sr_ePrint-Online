import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { readFile } from 'fs/promises';
import path from 'path';
import { pdfs } from '../pdfs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request) {
  try {
    const body = await request.json();

    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      pdfId,
    } = body;

    // ------------------------------------
    // 1. Check required fields
    // ------------------------------------

    if (
      !razorpay_order_id ||
      !razorpay_payment_id ||
      !razorpay_signature ||
      !pdfId
    ) {
      return NextResponse.json(
        {
          error: 'Required payment details are missing',
        },
        { status: 400 }
      );
    }

    // ------------------------------------
    // 2. Razorpay keys
    // ------------------------------------

    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!keyId || !keySecret) {
      return NextResponse.json(
        {
          error: 'Razorpay keys are missing',
        },
        { status: 500 }
      );
    }

    // ------------------------------------
    // 3. Verify Razorpay signature
    // ------------------------------------

    const generatedSignature = crypto
      .createHmac('sha256', keySecret)
      .update(
        razorpay_order_id + '|' + razorpay_payment_id
      )
      .digest('hex');

    const generatedBuffer =
      Buffer.from(generatedSignature, 'utf8');

    const receivedBuffer =
      Buffer.from(razorpay_signature, 'utf8');

    if (
      generatedBuffer.length !== receivedBuffer.length ||
      !crypto.timingSafeEqual(
        generatedBuffer,
        receivedBuffer
      )
    ) {
      return NextResponse.json(
        {
          error: 'Invalid payment signature',
        },
        { status: 400 }
      );
    }

    // ------------------------------------
    // 4. Find selected PDF
    // ------------------------------------

    const selectedPdf = pdfs.find(
      (pdf) => pdf.id === pdfId
    );

    if (!selectedPdf) {
      return NextResponse.json(
        {
          error: 'Selected PDF not found',
        },
        { status: 404 }
      );
    }

    // ------------------------------------
    // 5. Razorpay authentication
    // ------------------------------------

    const auth = Buffer.from(
      `${keyId}:${keySecret}`
    ).toString('base64');

    // ------------------------------------
    // 6. Verify Razorpay order
    // ------------------------------------

    const orderResponse = await fetch(
      `https://api.razorpay.com/v1/orders/${razorpay_order_id}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Basic ${auth}`,
        },
        cache: 'no-store',
      }
    );

    const orderData = await orderResponse.json();

    if (!orderResponse.ok) {
      return NextResponse.json(
        {
          error: 'Unable to verify Razorpay order',
        },
        { status: 400 }
      );
    }

    // ------------------------------------
    // 7. Verify order ID
    // ------------------------------------

    if (orderData.id !== razorpay_order_id) {
      return NextResponse.json(
        {
          error: 'Invalid Razorpay order',
        },
        { status: 400 }
      );
    }

    // ------------------------------------
    // 8. Verify amount
    // ₹99 = 9900 paise
    // ------------------------------------

    if (
      orderData.amount !== 9900 ||
      orderData.currency !== 'INR'
    ) {
      return NextResponse.json(
        {
          error: 'Invalid payment amount',
        },
        { status: 400 }
      );
    }

    // ------------------------------------
    // 9. Verify payment
    // ------------------------------------

    const paymentResponse = await fetch(
      `https://api.razorpay.com/v1/payments/${razorpay_payment_id}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Basic ${auth}`,
        },
        cache: 'no-store',
      }
    );

    const paymentData = await paymentResponse.json();

    if (!paymentResponse.ok) {
      return NextResponse.json(
        {
          error: 'Unable to verify Razorpay payment',
        },
        { status: 400 }
      );
    }

    // Payment must be captured
    if (paymentData.status !== 'captured') {
      return NextResponse.json(
        {
          error: 'Payment is not captured',
        },
        { status: 400 }
      );
    }

    // Verify payment amount
    if (
      paymentData.amount !== 9900 ||
      paymentData.currency !== 'INR'
    ) {
      return NextResponse.json(
        {
          error: 'Invalid payment amount',
        },
        { status: 400 }
      );
    }

    // ------------------------------------
    // 10. Read PDF from Public folder
    // ------------------------------------

    const pdfPath = path.join(
      process.cwd(),
      'Public',
      selectedPdf.file
    );

    const pdfBuffer = await readFile(pdfPath);

    // ------------------------------------
    // 11. Send PDF to customer
    // ------------------------------------

    return new NextResponse(pdfBuffer, {
      status: 200,

      headers: {
        'Content-Type': 'application/pdf',

        'Content-Disposition':
          `attachment; filename="${selectedPdf.file}"`,

        'Content-Length':
          pdfBuffer.length.toString(),

        'Cache-Control':
          'no-store, no-cache, must-revalidate',
      },
    });

  } catch (error) {
    console.error(
      'Payment verification error:',
      error
    );

    return NextResponse.json(
      {
        error:
          error?.message ||
          'Payment verification failed',
      },
      { status: 500 }
    );
  }
}
