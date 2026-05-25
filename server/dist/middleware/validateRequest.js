"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateBody = validateBody;
function validateBody(schema) {
    return (req, res, next) => {
        const parsed = schema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ error: 'Validation failed', issues: parsed.error.flatten() });
            return;
        }
        req.body = parsed.data;
        next();
    };
}
