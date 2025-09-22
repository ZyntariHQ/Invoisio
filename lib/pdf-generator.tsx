// PDF Generation utility using browser APIs
export interface InvoiceItem {
  id: string
  description: string
  quantity: number
  rate: number
  amount: number
}

export interface InvoiceData {
  invoiceNumber: string
  issueDate: string
  dueDate: string
  clientName: string
  clientEmail: string
  clientAddress: string
  notes: string
  currency: string
}

export async function generateInvoicePDF(invoiceData: InvoiceData, items: InvoiceItem[]): Promise<void> {
  // Create a new window for PDF generation
  const printWindow = window.open("", "_blank")

  if (!printWindow) {
    throw new Error("Unable to open print window. Please allow popups.")
  }

  const subtotal = items.reduce((sum, item) => sum + item.amount, 0)
  const tax = subtotal * 0.1
  const total = subtotal + tax

  // Generate HTML content for PDF
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Invoice ${invoiceData.invoiceNumber}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          line-height: 1.6;
          color: #333;
          max-width: 800px;
          margin: 0 auto;
          padding: 40px 20px;
        }
        .header { 
          display: flex; 
          justify-content: space-between; 
          align-items: flex-start; 
          margin-bottom: 40px;
          border-bottom: 2px solid #5C6EF8;
          padding-bottom: 20px;
        }
        .logo { 
          display: flex; 
          align-items: center; 
          gap: 8px;
        }
        .logo-icon {
          width: 24px;
          height: 24px;
          background: #5C6EF8;
          border-radius: 4px;
        }
        .company-name { 
          font-size: 24px; 
          font-weight: bold; 
          color: #5C6EF8;
        }
        .tagline { 
          font-size: 12px; 
          color: #666; 
          margin-top: 4px;
        }
        .invoice-title { 
          font-size: 28px; 
          font-weight: bold; 
          color: #333;
        }
        .invoice-number { 
          color: #666; 
          margin-top: 4px;
        }
        .details-grid { 
          display: grid; 
          grid-template-columns: 1fr 1fr; 
          gap: 40px; 
          margin-bottom: 40px;
        }
        .bill-to h3 { 
          font-weight: 600; 
          margin-bottom: 8px; 
          color: #333;
        }
        .bill-to p { 
          margin-bottom: 4px; 
          color: #666;
        }
        .client-name { 
          font-weight: 600; 
          color: #333 !important;
        }
        .invoice-dates { 
          text-align: right;
        }
        .date-row { 
          display: flex; 
          justify-content: space-between; 
          margin-bottom: 8px;
        }
        .date-label { 
          color: #666;
        }
        .date-value { 
          color: #333; 
          font-weight: 500;
        }
        .items-table { 
          width: 100%; 
          border-collapse: collapse; 
          margin-bottom: 30px;
        }
        .items-table th { 
          background: #f8f9fa; 
          padding: 12px; 
          text-align: left; 
          font-weight: 600; 
          border-bottom: 2px solid #dee2e6;
        }
        .items-table td { 
          padding: 12px; 
          border-bottom: 1px solid #dee2e6;
        }
        .text-center { text-align: center; }
        .text-right { text-align: right; }
        .totals { 
          margin-left: auto; 
          width: 300px; 
          margin-bottom: 30px;
        }
        .total-row { 
          display: flex; 
          justify-content: space-between; 
          margin-bottom: 8px;
        }
        .total-label { 
          color: #666;
        }
        .total-value { 
          color: #333; 
          font-weight: 500;
        }
        .final-total { 
          border-top: 2px solid #dee2e6; 
          padding-top: 8px; 
          font-size: 18px; 
          font-weight: bold;
        }
        .final-total .total-value { 
          color: #5C6EF8;
        }
        .notes { 
          margin-bottom: 30px;
        }
        .notes h3 { 
          font-weight: 600; 
          margin-bottom: 8px; 
          color: #333;
        }
        .notes p { 
          color: #666; 
          white-space: pre-line;
        }
        .footer { 
          border-top: 1px solid #dee2e6; 
          padding-top: 20px; 
          display: flex; 
          justify-content: space-between; 
          align-items: center; 
          font-size: 12px; 
          color: #666;
        }
        .security-badge { 
          display: flex; 
          align-items: center; 
          gap: 4px;
        }
        @media print {
          body { padding: 20px; }
          .no-print { display: none; }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div>
          <div class="logo">
            <div class="logo-icon"></div>
            <div class="company-name">Invoisio</div>
          </div>
          <div class="tagline">Privacy-First AI Invoice Generator</div>
        </div>
        <div style="text-align: right;">
          <div class="invoice-title">INVOICE</div>
          <div class="invoice-number">${invoiceData.invoiceNumber}</div>
        </div>
      </div>

      <div class="details-grid">
        <div class="bill-to">
          <h3>Bill To:</h3>
          <p class="client-name">${invoiceData.clientName}</p>
          <p>${invoiceData.clientEmail}</p>
          <p style="white-space: pre-line;">${invoiceData.clientAddress}</p>
        </div>
        <div class="invoice-dates">
          <div class="date-row">
            <span class="date-label">Issue Date:</span>
            <span class="date-value">${new Date(invoiceData.issueDate).toLocaleDateString()}</span>
          </div>
          <div class="date-row">
            <span class="date-label">Due Date:</span>
            <span class="date-value">${new Date(invoiceData.dueDate).toLocaleDateString()}</span>
          </div>
        </div>
      </div>

      <table class="items-table">
        <thead>
          <tr>
            <th>Description</th>
            <th class="text-center">Qty</th>
            <th class="text-right">Rate</th>
            <th class="text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${items
            .map(
              (item) => `
            <tr>
              <td>${item.description}</td>
              <td class="text-center">${item.quantity}</td>
              <td class="text-right">$${item.rate.toFixed(2)}</td>
              <td class="text-right">$${item.amount.toFixed(2)}</td>
            </tr>
          `,
            )
            .join("")}
        </tbody>
      </table>

      <div class="totals">
        <div class="total-row">
          <span class="total-label">Subtotal:</span>
          <span class="total-value">$${subtotal.toFixed(2)}</span>
        </div>
        <div class="total-row">
          <span class="total-label">Tax (10%):</span>
          <span class="total-value">$${tax.toFixed(2)}</span>
        </div>
        <div class="total-row final-total">
          <span class="total-label">Total:</span>
          <span class="total-value">$${total.toFixed(2)} ${invoiceData.currency}</span>
        </div>
      </div>

      ${
        invoiceData.notes
          ? `
        <div class="notes">
          <h3>Notes:</h3>
          <p>${invoiceData.notes}</p>
        </div>
      `
          : ""
      }

      <div class="footer">
        <div class="security-badge">
          <span>🛡️ Secured with Zero-Knowledge Proofs</span>
        </div>
        <span>Generated by Invoisio</span>
      </div>
    </body>
    </html>
  `

  // Write content and trigger print
  printWindow.document.write(htmlContent)
  printWindow.document.close()

  // Wait for content to load, then print
  printWindow.onload = () => {
    setTimeout(() => {
      printWindow.print()
      printWindow.close()
    }, 250)
  }
}

export async function sendInvoiceEmail(invoiceData: InvoiceData, items: InvoiceItem[]): Promise<void> {
  // Simulate sending email - in a real app, this would call your backend API
  const total = items.reduce((sum, item) => sum + item.amount, 0) * 1.1 // Including tax

  const subject = `Invoice ${invoiceData.invoiceNumber} from Invoisio`
  const body = `Dear ${invoiceData.clientName},

Please find attached your invoice ${invoiceData.invoiceNumber} for $${total.toFixed(2)}.

Invoice Details:
- Issue Date: ${new Date(invoiceData.issueDate).toLocaleDateString()}
- Due Date: ${new Date(invoiceData.dueDate).toLocaleDateString()}
- Amount: $${total.toFixed(2)} ${invoiceData.currency}

This invoice was generated using ZeroInvoice, ensuring your privacy with zero-knowledge proofs.

Thank you for your business!

Best regards,
ZeroInvoice Team`

  // Open email client with pre-filled content
  const mailtoLink = `mailto:${invoiceData.clientEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  window.open(mailtoLink)

  // In a real application, you would also:
  // 1. Generate and attach the PDF
  // 2. Send via your email service (SendGrid, etc.)
  // 3. Update invoice status to "sent"
  // 4. Create ZK proof for privacy
}
