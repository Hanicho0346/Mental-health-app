"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const configController_js_1 = require("../controllers/configController.js");
const router = (0, express_1.Router)();
router.get('/public', configController_js_1.getPublicConfig);
exports.default = router;
