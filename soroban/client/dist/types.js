"use strict";
// ─── Asset ───────────────────────────────────────────────────────────────────
Object.defineProperty(exports, "__esModule", { value: true });
exports.SorobanContractError = exports.CONTRACT_ERROR_CODES = void 0;
// ─── Error handling ───────────────────────────────────────────────────────────
/** Numeric codes matching the Rust `ContractError` enum. */
exports.CONTRACT_ERROR_CODES = {
    1: 'AlreadyInitialized',
    2: 'NotInitialized',
    3: 'PaymentAlreadyRecorded',
    4: 'PaymentNotFound',
    5: 'InvalidAmount',
    6: 'InvalidInvoiceId',
    7: 'InvalidAsset',
};
class SorobanContractError extends Error {
    code;
    numericCode;
    name = 'SorobanContractError';
    constructor(code, numericCode, message) {
        super(message);
        this.code = code;
        this.numericCode = numericCode;
    }
}
exports.SorobanContractError = SorobanContractError;
//# sourceMappingURL=types.js.map