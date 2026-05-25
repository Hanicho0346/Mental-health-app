"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertPatientOwnsAppointment = assertPatientOwnsAppointment;
exports.assertPsychiatristAssigned = assertPsychiatristAssigned;
exports.assertAdminOrPatientOrAssignedPsychiatrist = assertAdminOrPatientOrAssignedPsychiatrist;
const AppError_js_1 = require("../../utils/AppError.js");
function assertPatientOwnsAppointment(requestUserId, doc) {
    if (String(doc.user_id) !== requestUserId) {
        throw new AppError_js_1.AppError(403, 'Forbidden');
    }
}
function assertPsychiatristAssigned(requestUserId, doc) {
    const assigned = doc.psychiatrist_user_id;
    if (!assigned || String(assigned) !== requestUserId) {
        throw new AppError_js_1.AppError(403, 'Forbidden');
    }
}
function assertAdminOrPatientOrAssignedPsychiatrist(requestUserId, role, doc) {
    if (role === 'admin')
        return;
    if (role === 'user') {
        assertPatientOwnsAppointment(requestUserId, doc);
        return;
    }
    assertPsychiatristAssigned(requestUserId, doc);
}
