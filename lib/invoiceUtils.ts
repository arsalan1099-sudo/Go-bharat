import { Invoice, InvoiceItem, InvoiceType } from "./types";

const COMPANY_NAME = process.env.EXPO_PUBLIC_COMPANY_NAME || "AASAA PVT. LTD.";
const COMPANY_GSTIN = process.env.EXPO_PUBLIC_COMPANY_GSTIN || "27AABCG1234M1ZP";
const COMPANY_ADDRESS = process.env.EXPO_PUBLIC_COMPANY_ADDRESS || "Malegaon, Nashik District, Maharashtra - 423203";
const COMPANY_PHONE = process.env.EXPO_PUBLIC_COMPANY_PHONE || "+91 9168134109";

function nextInvoiceNumber(): string {
  const year = new Date().getFullYear();
  const seq = Date.now().toString().slice(-5);
  const rand = Math.floor(Math.random() * 90 + 10);
  return `GB-INV-${year}-${seq}${rand}`;
}

const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function numberToWords(num: number): string {
  if (num === 0) return "Zero";
  const rupees = Math.floor(num);
  const paise = Math.round((num - rupees) * 100);

  function convert(n: number): string {
    if (n < 20) return ones[n];
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? " " + ones[n % 10] : "");
    if (n < 1000) return ones[Math.floor(n / 100)] + " Hundred" + (n % 100 ? " and " + convert(n % 100) : "");
    if (n < 100000) return convert(Math.floor(n / 1000)) + " Thousand" + (n % 1000 ? " " + convert(n % 1000) : "");
    if (n < 10000000) return convert(Math.floor(n / 100000)) + " Lakh" + (n % 100000 ? " " + convert(n % 100000) : "");
    return convert(Math.floor(n / 10000000)) + " Crore" + (n % 10000000 ? " " + convert(n % 10000000) : "");
  }

  let result = "Rupees " + convert(rupees);
  if (paise > 0) result += " and " + convert(paise) + " Paise";
  result += " Only";
  return result;
}

function createInvoiceItems(items: Array<{ description: string; hsnSac: string; qty: number; rate: number; }>): InvoiceItem[] {
  return items.map((item) => {
    const taxableValue = item.rate * item.qty;
    const cgstRate = 9;
    const sgstRate = 9;
    const cgstAmount = Math.round(taxableValue * cgstRate / 100 * 100) / 100;
    const sgstAmount = Math.round(taxableValue * sgstRate / 100 * 100) / 100;
    const total = taxableValue + cgstAmount + sgstAmount;
    return {
      description: item.description,
      hsnSac: item.hsnSac,
      qty: item.qty,
      rate: item.rate,
      taxableValue,
      cgstRate,
      cgstAmount,
      sgstRate,
      sgstAmount,
      total,
    };
  });
}

interface GenerateInvoiceParams {
  type: InvoiceType;
  referenceId: string;
  toName: string;
  toPhone: string;
  toAddress: string;
  toGSTIN?: string;
  paymentMethod: string;
  rawItems: Array<{ description: string; hsnSac: string; qty: number; rate: number }>;
  notes?: string;
}

export function generateInvoice(params: GenerateInvoiceParams): Invoice {
  const items = createInvoiceItems(params.rawItems);
  const subtotal = items.reduce((s, i) => s + i.taxableValue, 0);
  const cgstTotal = items.reduce((s, i) => s + i.cgstAmount, 0);
  const sgstTotal = items.reduce((s, i) => s + i.sgstAmount, 0);
  const totalTax = cgstTotal + sgstTotal;
  const grandTotal = subtotal + totalTax;

  return {
    id: "inv_" + Date.now().toString() + Math.random().toString(36).substr(2, 5),
    invoiceNumber: nextInvoiceNumber(),
    type: params.type,
    referenceId: params.referenceId,
    fromName: COMPANY_NAME,
    fromAddress: COMPANY_ADDRESS,
    fromGSTIN: COMPANY_GSTIN,
    fromPhone: COMPANY_PHONE,
    toName: params.toName,
    toAddress: params.toAddress,
    toGSTIN: params.toGSTIN,
    toPhone: params.toPhone,
    items,
    subtotal,
    cgstTotal,
    sgstTotal,
    totalTax,
    grandTotal,
    amountInWords: numberToWords(grandTotal),
    paymentMethod: params.paymentMethod,
    transactionId: "TXN" + Date.now().toString().slice(-8),
    createdAt: new Date().toISOString(),
    notes: params.notes,
  };
}
