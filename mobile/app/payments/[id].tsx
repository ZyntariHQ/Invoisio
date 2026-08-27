// Payment links use the invoice payment experience but remain a distinct,
// public route so a payer is never redirected through merchant authentication.
export { default } from "../invoices/[id]";
