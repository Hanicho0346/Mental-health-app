"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
require("dotenv/config");
const env_schema_js_1 = require("./env.schema.js");
exports.env = (0, env_schema_js_1.parseEnv)(process.env);
