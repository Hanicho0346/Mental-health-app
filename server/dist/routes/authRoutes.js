"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = void 0;
/** Thin re-export — canonical router lives in `modules/auth/auth.routes.ts`. */
var auth_routes_js_1 = require("../modules/auth/auth.routes.js");
Object.defineProperty(exports, "default", { enumerable: true, get: function () { return __importDefault(auth_routes_js_1).default; } });
