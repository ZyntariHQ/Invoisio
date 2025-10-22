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
  // New optional field: merchant wallet address to include on the PDF/email
  merchantWalletAddress?: string
  // Optional editable tax rate (%)
  taxRate?: number
}

function buildInvoiceHTML(invoiceData: InvoiceData, items: InvoiceItem[]) {
  const subtotal = items.reduce((sum, item) => sum + item.amount, 0)
  const tax = subtotal * ((invoiceData.taxRate ?? 10) / 100)
  const total = subtotal + tax

  return `
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
        .invoice-number { 
          color: #666; 
          margin-top: 4px;
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
        .pay-to { 
          background: #f8f9fa; 
          border: 1px solid #dee2e6; 
          padding: 12px; 
          border-radius: 8px; 
          margin-bottom: 30px;
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
          word-break: break-word;
          overflow-wrap: anywhere;
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
        @page { margin: 20pt; }
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
            <img src="/assest/invoisio_logo.svg" alt="Invoisio" style="height:28px;" />
            <span class="company-name">Invoisio</span>
          </div>
          <div class="tagline">Privacy-First AI Invoice Generator</div>
        </div>
        <div style="text-align: right;">
          <div class="invoice-number">${invoiceData.invoiceNumber}</div>
        </div>
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

      ${invoiceData.merchantWalletAddress ? `
        <div class="pay-to">
          <div class="pay-to-title">Pay To (Base)</div>
          <div class="pay-to-sub">Send ETH/USDC on Base to this address</div>
          <div class="pay-to-address">${invoiceData.merchantWalletAddress}</div>
        </div>
      ` : ""}

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
          <span class="total-label">Tax (${invoiceData.taxRate ?? 10}%):</span>
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
        <div></div>
        <span style="display:inline-flex;align-items:center;gap:6px;">
          Powered by <img src="/Base_Logo_0.svg" alt="Base" style="height:16px;" />
        </span>
      </div>
    </body>
    </html>
  `
}

export async function generateInvoicePDF(invoiceData: InvoiceData, items: InvoiceItem[]): Promise<void> {
  // Generate a styled PDF Blob (same source as sharing) and trigger download
  try {
    const blob = await generateStyledInvoicePDFBlob(invoiceData, items)
    const filename = `invoice-${invoiceData.invoiceNumber}.pdf`
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  } catch (e) {
    // Fallback: open print window using the same HTML
    const printWindow = window.open("", "_blank")
    if (!printWindow) {
      throw new Error("Unable to open print window. Please allow popups.")
    }
    const htmlContent = buildInvoiceHTML(invoiceData, items)
    printWindow.document.write(htmlContent)
    printWindow.document.close()
    try {
      printWindow.document.title = " ";
      printWindow.history.replaceState(null, " ", " ")
    } catch {}
    printWindow.onload = () => {
      setTimeout(() => {
        printWindow.print()
        printWindow.close()
      }, 250)
    }
  }
}

export async function sendInvoiceEmail(invoiceData: InvoiceData, items: InvoiceItem[]): Promise<void> {
  // Simulate sending email - in a real app, this would call your backend API
  const subtotal = items.reduce((sum, item) => sum + item.amount, 0)
  const tax = subtotal * ((invoiceData.taxRate ?? 10) / 100)
  const total = subtotal + tax // Including tax

  const subject = `Invoice ${invoiceData.invoiceNumber} from Invoisio`
  const body = `Dear ${invoiceData.clientName},

Please find attached your invoice ${invoiceData.invoiceNumber} for $${total.toFixed(2)}.

Invoice Details:
- Issue Date: ${new Date(invoiceData.issueDate).toLocaleDateString()}
- Due Date: ${new Date(invoiceData.dueDate).toLocaleDateString()}
- Amount: $${total.toFixed(2)} ${invoiceData.currency}
${invoiceData.merchantWalletAddress ? `- Pay To (Base): ${invoiceData.merchantWalletAddress}\n  Send ETH/USDC on Base to this address.` : ""}

This invoice was generated with Invoisio. Your data is processed privately.

Thank you for your business!

Best regards,
Invoisio Team`

  const mailtoLink = `mailto:${invoiceData.clientEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  window.open(mailtoLink)
}

// --- Minimal client-side PDF Blob generator + share helper ---
function escapePdfText(text: string) {
  return text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)")
}

function buildInvoiceLines(invoiceData: InvoiceData, items: InvoiceItem[]) {
  const subtotal = items.reduce((sum, item) => sum + item.amount, 0)
  const tax = subtotal * ((invoiceData.taxRate ?? 10) / 100)
  const total = subtotal + tax

  const lines: string[] = []
  lines.push(`Invoice ${invoiceData.invoiceNumber}`)
  lines.push(`Client: ${invoiceData.clientName}`)
  lines.push(`Email: ${invoiceData.clientEmail}`)
  if (invoiceData.clientAddress) lines.push(`Address: ${invoiceData.clientAddress}`)
  lines.push(`Issue: ${new Date(invoiceData.issueDate).toLocaleDateString()}`)
  lines.push(`Due: ${new Date(invoiceData.dueDate).toLocaleDateString()}`)
  if (invoiceData.merchantWalletAddress) lines.push(`Pay To (Base): ${invoiceData.merchantWalletAddress}`)
  lines.push("")
  lines.push("Items:")
  items.forEach((it) => {
    lines.push(`${it.description}  Qty: ${it.quantity}  Rate: $${it.rate.toFixed(2)}  Amount: $${it.amount.toFixed(2)}`)
  })

  lines.push("")
  lines.push(`Subtotal: $${subtotal.toFixed(2)}`)
  lines.push(`Tax (${invoiceData.taxRate ?? 10}%): $${tax.toFixed(2)}`)
  lines.push(`Total: $${total.toFixed(2)} ${invoiceData.currency}`)
  if (invoiceData.notes) {
    lines.push("")
    lines.push("Notes:")
    invoiceData.notes.split(/\r?\n/).forEach((n) => lines.push(n))
  }
  return lines
}

export async function generateInvoicePDFBlob(invoiceData: InvoiceData, items: InvoiceItem[]): Promise<Blob> {
  const width = 595 // A4 width in points
  const height = 842 // A4 height in points
  const fontSize = 12
  const lineHeight = 16

  const lines = buildInvoiceLines(invoiceData, items)

  let content = "BT\n" // Begin Text
  content += `/F1 ${fontSize} Tf\n`
  content += `72 800 Td\n`
  for (const line of lines) {
    const esc = escapePdfText(line)
    content += `(${esc}) Tj\n`
    content += `0 -${lineHeight} Td\n`
  }
  content += "ET" // End Text

  const stream = `<< /Length ${content.length} >>\nstream\n${content}\nendstream\n`

  const obj1 = `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`
  const obj2 = `2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n`
  const obj3 = `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Contents 4 0 R /Resources 5 0 R >>\nendobj\n`
  const obj4 = `4 0 obj\n${stream}endobj\n`
  const obj5 = `5 0 obj\n<< /Font << /F1 6 0 R >> >>\nendobj\n`
  const obj6 = `6 0 obj\n<< /Type /Font /Subtype /Type1 /Name /F1 /BaseFont /Helvetica >>\nendobj\n`

  const header = `%PDF-1.4\n`
  const chunks = [obj1, obj2, obj3, obj4, obj5, obj6]
  const offsets: number[] = []
  let offset = header.length
  for (const ch of chunks) {
    offsets.push(offset)
    offset += ch.length
  }
  const xrefStart = offset

  let xref = `xref\n0 7\n`
  xref += `0000000000 65535 f \n`
  for (const off of offsets) {
    const padded = off.toString().padStart(10, "0")
    xref += `${padded} 00000 n \n`
  }

  const trailer = `trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`

  const pdf = header + chunks.join("") + xref + trailer
  return new Blob([pdf], { type: "application/pdf" })
}

export async function generateStyledInvoicePDFBlob(invoiceData: InvoiceData, items: InvoiceItem[]): Promise<Blob> {
  try {
    const html2pdfModule: any = await import("html2pdf.js")
    const html2pdf = html2pdfModule?.default || html2pdfModule
    if (!html2pdf) throw new Error("html2pdf not available")

    const container = document.createElement("div")
    container.style.width = "794px" // ~A4 width at 96dpi
    container.style.padding = "16px"
    container.innerHTML = buildInvoiceHTML(invoiceData, items)
    document.body.appendChild(container)

    const worker = html2pdf()
      .from(container)
      .set({
        margin: 10, // add margin to avoid bottom cut-off
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: { scale: Math.min(window.devicePixelRatio || 2, 3), useCORS: true },
        jsPDF: { unit: "pt", format: "a4", orientation: "portrait" },
      })
      .toPdf()

    const pdf: any = await worker.get("pdf")
    const blob: Blob = pdf.output("blob")

    // cleanup
    document.body.removeChild(container)

    return blob
  } catch (e) {
    console.warn("Styled PDF generation failed, falling back to minimal blob:", e)
    return generateInvoicePDFBlob(invoiceData, items)
  }
}

export async function shareInvoicePDF(invoiceData: InvoiceData, items: InvoiceItem[]): Promise<void> {
  const blob = await generateStyledInvoicePDFBlob(invoiceData, items)
  const filename = `invoice-${invoiceData.invoiceNumber}.pdf`
  const file = new File([blob], filename, { type: "application/pdf" })

  if ((navigator as any).canShare && (navigator as any).canShare({ files: [file] })) {
    await (navigator as any).share({
      files: [file],
      title: `Invoice ${invoiceData.invoiceNumber}`,
      text: `Invoice ${invoiceData.invoiceNumber}`,
    })
    return
  }

  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
  alert("Your browser does not support file sharing. The PDF was downloaded instead.")
}
