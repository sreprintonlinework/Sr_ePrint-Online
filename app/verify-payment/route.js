import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { readFile } from 'fs/promises';
import path from 'path';
import { pdfs } from '../pdfs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request) {
  try {
    // ==========================================
    // 1. READ REQUEST
    // ==========================================

    const body = await request.json();

    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      pdfId,
    } = body;

    // ==========================================
    // 2. CHECK REQUIRED FIELDS
    // ==========================================

    if (
      !razorpay_order_id ||
      !razorpay_payment_id ||
      !razorpay_signature ||
      !pdfId
    ) {
      return NextResponse.json(
        {
          error:
            'Required payment details are missing.',
        },
        { status: 400 }
      );
    }

    // ==========================================
    // 3. FIND SELECTED FILE
    // ==========================================

    const selectedPdf = pdfs.find(
      (pdf) =>
        String(pdf.id) === String(pdfId)
    );

    if (!selectedPdf) {
      return NextResponse.json(
        {
          error:
            'Selected PDF/File not found.',
        },
        { status: 404 }
      );
    }

    // ==========================================
    // 4. RAZORPAY KEYS
    // ==========================================

    const keyId =
      process.env.RAZORPAY_KEY_ID;

    const keySecret =
      process.env.RAZORPAY_KEY_SECRET;

    if (!keyId || !keySecret) {
      console.error(
        'Razorpay keys are missing.'
      );

      return NextResponse.json(
        {
          error:
            'Razorpay keys are missing.',
        },
        { status: 500 }
      );
    }

    // ==========================================
    // 5. VERIFY SIGNATURE
    // ==========================================

    const signatureText =
      razorpay_order_id +
      '|' +
      razorpay_payment_id;

    const generatedSignature =
      crypto
        .createHmac(
          'sha256',
          keySecret
        )
        .update(signatureText)
        .digest('hex');

    const generatedBuffer =
      Buffer.from(
        generatedSignature,
        'utf8'
      );

    const receivedBuffer =
      Buffer.from(
        String(razorpay_signature),
        'utf8'
      );

    if (
      generatedBuffer.length !==
        receivedBuffer.length ||
      !crypto.timingSafeEqual(
        generatedBuffer,
        receivedBuffer
      )
    ) {
      console.error(
        'Invalid Razorpay signature.'
      );

      return NextResponse.json(
        {
          error:
            'Invalid payment signature.',
        },
        { status: 400 }
      );
    }

    // ==========================================
    // 6. DYNAMIC EXPECTED PRICE
    // ==========================================

    const price =
      Number(selectedPdf.price);

    if (
      !Number.isFinite(price) ||
      price <= 0
    ) {
      return NextResponse.json(
        {
          error:
            'Invalid file price configuration.',
        },
        { status: 500 }
      );
    }

    const expectedAmount =
      Math.round(price * 100);

    // ==========================================
    // 7. RAZORPAY AUTH
    // ==========================================

    const auth = Buffer.from(
      `${keyId}:${keySecret}`
    ).toString('base64');

    // ==========================================
    // 8. VERIFY ORDER
    // ==========================================

    const orderResponse =
      await fetch(
        `https://api.razorpay.com/v1/orders/${razorpay_order_id}`,
        {
          method: 'GET',

          headers: {
            Authorization:
              `Basic ${auth}`,
          },

          cache: 'no-store',
        }
      );

    const orderData =
      await orderResponse.json();

    if (!orderResponse.ok) {
      console.error(
        'Order verification failed:',
        orderData
      );

      return NextResponse.json(
        {
          error:
            orderData?.error?.description ||
            'Unable to verify Razorpay order.',
        },
        { status: 400 }
      );
    }

    // ==========================================
    // 9. VERIFY ORDER ID
    // ==========================================

    if (
      orderData.id !==
      razorpay_order_id
    ) {
      return NextResponse.json(
        {
          error:
            'Invalid Razorpay order.',
        },
        { status: 400 }
      );
    }

    // ==========================================
    // 10. VERIFY PDF ID
    // ==========================================

    const orderPdfId =
      orderData?.notes?.pdfId;

    if (
      orderPdfId &&
      String(orderPdfId) !==
        String(selectedPdf.id)
    ) {
      console.error(
        'PDF ID mismatch:',
        orderPdfId,
        selectedPdf.id
      );

      return NextResponse.json(
        {
          error:
            'Payment order and selected file do not match.',
        },
        { status: 400 }
      );
    }

    // ==========================================
    // 11. VERIFY ORDER AMOUNT
    // ==========================================

    if (
      Number(orderData.amount) !==
        expectedAmount ||
      orderData.currency !== 'INR'
    ) {
      console.error(
        'Invalid order amount:',
        orderData.amount,
        'Expected:',
        expectedAmount
      );

      return NextResponse.json(
        {
          error:
            'Invalid payment amount.',
        },
        { status: 400 }
      );
    }

    // ==========================================
    // 12. VERIFY PAYMENT
    // ==========================================

    const paymentResponse =
      await fetch(
        `https://api.razorpay.com/v1/payments/${razorpay_payment_id}`,
        {
          method: 'GET',

          headers: {
            Authorization:
              `Basic ${auth}`,
          },

          cache: 'no-store',
        }
      );

    const paymentData =
      await paymentResponse.json();

    if (!paymentResponse.ok) {
      console.error(
        'Payment verification failed:',
        paymentData
      );

      return NextResponse.json(
        {
          error:
            paymentData?.error?.description ||
            'Unable to verify Razorpay payment.',
        },
        { status: 400 }
      );
    }

    // ==========================================
    // 13. VERIFY PAYMENT ORDER
    // ==========================================

    if (
      paymentData.order_id !==
      razorpay_order_id
    ) {
      return NextResponse.json(
        {
          error:
            'Payment does not belong to this order.',
        },
        { status: 400 }
      );
    }

    // ==========================================
    // 14. PAYMENT MUST BE CAPTURED
    // ==========================================

    if (
      paymentData.status !==
      'captured'
    ) {
      return NextResponse.json(
        {
          error:
            'Payment is not captured yet.',
        },
        { status: 400 }
      );
    }

    // ==========================================
    // 15. VERIFY PAYMENT AMOUNT
    // ==========================================

    if (
      Number(paymentData.amount) !==
        expectedAmount ||
      paymentData.currency !== 'INR'
    ) {
      console.error(
        'Invalid payment amount:',
        paymentData.amount,
        'Expected:',
        expectedAmount
      );

      return NextResponse.json(
        {
          error:
            'Invalid payment amount.',
        },
        { status: 400 }
      );
    }

    // ==========================================
    // 16. CHECK FILE NAME
    // ==========================================

    if (
      !selectedPdf.file ||
      typeof selectedPdf.file !==
        'string'
    ) {
      return NextResponse.json(
        {
          error:
            'File configuration is invalid.',
        },
        { status: 500 }
      );
    }

    // ==========================================
    // 17. FILE EXTENSION
    // ==========================================

    const extension =
      path
        .extname(selectedPdf.file)
        .toLowerCase();

    // ==========================================
    // 18. ALLOWED FILE TYPES
    // ==========================================

    const allowedExtensions = [
      '.pdf',
      '.xls',
      '.xlsx',
      '.doc',
      '.docx',
    ];

    if (
      !allowedExtensions.includes(
        extension
      )
    ) {
      return NextResponse.json(
        {
          error:
            'This file type is not supported.',
        },
        { status: 400 }
      );
    }

    // ==========================================
    // 19. PUBLIC FOLDER
    // ==========================================

    const publicDirectory =
      path.join(
        process.cwd(),
        'public'
      );

    const filePath =
      path.join(
        publicDirectory,
        selectedPdf.file
      );

    // ==========================================
    // 20. SECURITY CHECK
    // ==========================================

    const resolvedPublicDirectory =
      path.resolve(
        publicDirectory
      );

    const resolvedFilePath =
      path.resolve(filePath);

    if (
      !resolvedFilePath.startsWith(
        resolvedPublicDirectory +
          path.sep
      )
    ) {
      return NextResponse.json(
        {
          error:
            'Invalid file path.',
        },
        { status: 400 }
      );
    }

    // ==========================================
    // 21. READ FILE
    // ==========================================

    let fileBuffer;

    try {
      fileBuffer =
        await readFile(
          resolvedFilePath
        );
    } catch (fileError) {
      console.error(
        'FILE READ ERROR:',
        fileError
      );

      return NextResponse.json(
        {
          error:
            'Payment successful, but the requested file could not be found on the server.',
        },
        { status: 404 }
      );
    }

    // ==========================================
    // 22. CONTENT TYPE
    // ==========================================

    let contentType =
      'application/octet-stream';

    switch (extension) {
      case '.pdf':
        contentType =
          'application/pdf';
        break;

      case '.xls':
        contentType =
          'application/vnd.ms-excel';
        break;

      case '.xlsx':
        contentType =
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        break;

      case '.doc':
        contentType =
          'application/msword';
        break;

      case '.docx':
        contentType =
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        break;
    }

    // ==========================================
    // 23. SEND FILE
    // ==========================================

    return new NextResponse(
      fileBuffer,
      {
        status: 200,

        headers: {
          'Content-Type':
            contentType,

          'Content-Disposition':
            `attachment; filename="${selectedPdf.file}"`,

          'Content-Length':
            fileBuffer.length.toString(),

          'Cache-Control':
            'no-store, no-cache, must-revalidate, proxy-revalidate',

          Pragma: 'no-cache',

          Expires: '0',
        },
      }
    );
  } catch (error) {
    console.error(
      'PAYMENT VERIFICATION ERROR:',
      error
    );

    return NextResponse.json(
      {
        error:
          error?.message ||
          'Payment verification failed.',
      },
      { status: 500 }
    );
  }
}
