"use strict";
// ─── Asset ───────────────────────────────────────────────────────────────────
Object.defineProperty(exports, "__esModule", { value: true });
exports.SorobanContractError = exports.getContractErrorCode = exports.getContractError = exports.CONTRACT_ERROR_MANIFEST = exports.CONTRACT_ERROR_CODES = void 0;
// ─── Error handling ───────────────────────────────────────────────────────────
// The typed contract error manifest (codes + meanings) lives in
// `./error-manifest` and is re-exported here so existing imports keep working.
const error_manifest_1 = require("./error-manifest");
Object.defineProperty(exports, "CONTRACT_ERROR_CODES", { enumerable: true, get: function () { return error_manifest_1.CONTRACT_ERROR_CODES; } });
Object.defineProperty(exports, "CONTRACT_ERROR_MANIFEST", { enumerable: true, get: function () { return error_manifest_1.CONTRACT_ERROR_MANIFEST; } });
Object.defineProperty(exports, "getContractError", { enumerable: true, get: function () { return error_manifest_1.getContractError; } });
Object.defineProperty(exports, "getContractErrorCode", { enumerable: true, get: function () { return error_manifest_1.getContractErrorCode; } });
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