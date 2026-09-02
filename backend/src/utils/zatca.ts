import { generateQR } from './qrcode';

export interface ZatcaInvoiceData {
  seller_name: string;
  seller_vat_number: string;
  timestamp: string;
  total: string;
  vat_amount: string;
  buyer_name?: string;
  buyer_vat_number?: string;
}

// ZATCA TLV tags (simplified + standard)
export const ZATCA_TAGS = {
  seller_name: 1,
  seller_vat: 2,
  timestamp: 3,
  total: 4,
  vat: 5,
  hash: 6,
  signature: 7,
  public_key: 8,
  signature_format: 9,
  issuer_id: 10,
  issuer_name: 11,
  reference_id: 12,
  customer_id: 13,
  customer_name: 14,
};

function tlv(tag: number, value: string): Buffer {
  const buf = Buffer.from(value, 'utf8');
  if (buf.length > 255) throw new Error(`ZATCA TLV value too long for tag ${tag}`);
  const out = Buffer.alloc(2 + buf.length);
  out[0] = tag & 0xff;
  out[1] = buf.length;
  buf.copy(out, 2);
  return out;
}

export function buildZatcaTLV(data: ZatcaInvoiceData): Buffer {
  const parts: Buffer[] = [
    tlv(ZATCA_TAGS.seller_name, data.seller_name || ''),
    tlv(ZATCA_TAGS.seller_vat, data.seller_vat_number || ''),
    tlv(ZATCA_TAGS.timestamp, data.timestamp),
    tlv(ZATCA_TAGS.total, data.total),
    tlv(ZATCA_TAGS.vat, data.vat_amount),
  ];
  if (data.buyer_name) parts.push(tlv(ZATCA_TAGS.customer_name, data.buyer_name));
  if (data.buyer_vat_number) parts.push(tlv(ZATCA_TAGS.customer_id, data.buyer_vat_number));
  return Buffer.concat(parts);
}

export function buildZatcaQR(data: ZatcaInvoiceData, opts?: { scale?: number; level?: string }): { base64: string; svg: string; tlv_hex: string } {
  const tlv = buildZatcaTLV(data);
  const base64 = tlv.toString('base64');
  const qr = generateQR(base64, { level: opts?.level || 'M', scale: opts?.scale || 8 });
  return { base64, svg: qr.svg, tlv_hex: tlv.toString('hex') };
}

export function toZatcaTimestamp(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toISOString().slice(0, 19) + 'Z';
}

export function toDecimal(value: number | string): string {
  const n = Number(value);
  if (!isFinite(n)) return '0.00';
  return n.toFixed(2);
}

export function xmlEscape(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function formatXmlDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function formatXmlTime(d: Date): string {
  return d.toISOString().slice(11, 19) + 'Z';
}

// Simplified ZATCA e-invoice (UBL 2.1)
export function buildEInvoiceXML(opts: {
  company: { name: string; name_en?: string; address?: string; city?: string; postal_code?: string; tax_number?: string; commercial_registry?: string };
  invoice: {
    invoice_number: string;
    issue_date: string;
    total: number;
    tax: number;
    discount: number;
    subtotal: number;
    currency?: string;
  };
  client?: { name?: string; tax_number?: string; address?: string; city?: string };
  items: { name: string; quantity: number; unit_price: number; total: number }[];
}): string {
  const { company, invoice, client, items } = opts;
  const currency = invoice.currency || 'IQD';
  const vatRate = invoice.total > 0 ? (invoice.tax / Math.max(invoice.total - invoice.tax, 0.000001)) * 100 : 0;
  const issueDate = new Date(invoice.issue_date);
  const dateStr = formatXmlDate(issueDate);
  const timeStr = formatXmlTime(issueDate);
  const lines = items.map((it, i) => {
    const unit = toDecimal(it.unit_price);
    const qty = toDecimal(it.quantity);
    const lineTotal = toDecimal(it.total);
    const vat = toDecimal((it.quantity * it.unit_price) * (vatRate / 100));
    return `
      <cac:InvoiceLine>
        <cbc:ID>${i + 1}</cbc:ID>
        <cbc:InvoicedQuantity unitCode="PCE">${qty}</cbc:InvoicedQuantity>
        <cbc:LineExtensionAmount currencyID="${currency}">${lineTotal}</cbc:LineExtensionAmount>
        <cac:TaxTotal>
          <cbc:TaxAmount currencyID="${currency}">${vat}</cbc:TaxAmount>
          <cac:TaxSubtotal>
            <cbc:TaxableAmount currencyID="${currency}">${lineTotal}</cbc:TaxableAmount>
            <cbc:TaxAmount currencyID="${currency}">${vat}</cbc:TaxAmount>
            <cac:TaxCategory>
              <cbc:ID schemeAgencyID="6">S</cbc:ID>
              <cbc:Percent>${vatRate.toFixed(2)}</cbc:Percent>
              <cac:TaxScheme>
                <cbc:ID schemeAgencyID="6">VAT</cbc:ID>
              </cac:TaxScheme>
            </cac:TaxCategory>
          </cac:TaxSubtotal>
        </cac:TaxTotal>
        <cac:Item>
          <cbc:Name>${xmlEscape(it.name)}</cbc:Name>
        </cac:Item>
        <cac:Price>
          <cbc:PriceAmount currencyID="${currency}">${unit}</cbc:PriceAmount>
        </cac:Price>
      </cac:InvoiceLine>`;
  }).join('');

  const buyerName = client?.name ? `<cbc:RegistrationName>${xmlEscape(client.name)}</cbc:RegistrationName>` : '<cbc:RegistrationName>N/A</cbc:RegistrationName>';
  const buyerTax = client?.tax_number ? `<cbc:CompanyID schemeAgencyID="6" schemeID="CRN">${xmlEscape(client.tax_number)}</cbc:CompanyID>` : '';
  const buyerAddress = client?.address || client?.city
    ? `<cac:Address><cbc:CityName>${xmlEscape(client?.city || '')}</cbc:CityName><cbc:StreetName>${xmlEscape(client?.address || '')}</cbc:StreetName></cac:Address>` : '';
  const companyTax = company.tax_number ? `<cbc:CompanyID schemeAgencyID="6" schemeID="VAT">${xmlEscape(company.tax_number)}</cbc:CompanyID>` : '';
  const companyCR = company.commercial_registry ? `<cbc:CompanyID schemeAgencyID="6" schemeID="CRN">${xmlEscape(company.commercial_registry)}</cbc:CompanyID>` : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ProfileID>reporting:1.0</cbc:ProfileID>
  <cbc:ID>${xmlEscape(invoice.invoice_number)}</cbc:ID>
  <cbc:UUID>${xmlEscape(invoice.invoice_number)}</cbc:UUID>
  <cbc:IssueDate>${dateStr}</cbc:IssueDate>
  <cbc:IssueTime>${timeStr}</cbc:IssueTime>
  <cbc:InvoiceTypeCode name="0100000">388</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>${currency}</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyIdentification>${companyTax}${companyCR}</cac:PartyIdentification>
      <cac:PartyName>
        <cbc:Name>${xmlEscape(company.name)}</cbc:Name>
      </cac:PartyName>
      <cac:PostalAddress>
        <cbc:CityName>${xmlEscape(company.city || '')}</cbc:CityName>
        <cbc:StreetName>${xmlEscape(company.address || '')}</cbc:StreetName>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:CompanyID schemeAgencyID="6" schemeID="VAT">${xmlEscape(company.tax_number || '')}</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID schemeAgencyID="6">VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyIdentification>${buyerTax}</cac:PartyIdentification>
      <cac:PartyName>${buyerName}</cac:PartyName>
      ${buyerAddress}
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="${currency}">${toDecimal(invoice.tax)}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="${currency}">${toDecimal(invoice.subtotal - invoice.discount)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="${currency}">${toDecimal(invoice.tax)}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID schemeAgencyID="6">S</cbc:ID>
        <cbc:Percent>${vatRate.toFixed(2)}</cbc:Percent>
        <cac:TaxScheme><cbc:ID schemeAgencyID="6">VAT</cbc:ID></cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="${currency}">${toDecimal(invoice.subtotal)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="${currency}">${toDecimal(invoice.subtotal - invoice.discount)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="${currency}">${toDecimal(invoice.total)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="${currency}">${toDecimal(invoice.total)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  ${lines}
</Invoice>`;
}
