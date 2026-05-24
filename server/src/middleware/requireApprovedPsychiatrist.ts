import type { RequestHandler } from 'express';
import { User } from '../models/User.js';

/**
 * After `requireAuth`. Ensures the account exists, is a psychiatrist, and is **approved**.
 * Does not apply to registration, profile, document upload, or verification submission routes.
 */
export const requireApprovedPsychiatrist: RequestHandler = async (req, res, next) => {
  const a = req.auth;
  if (!a) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const user = await User.findById(a.id).select('role verification_status is_approved').lean();
  if (!user) {
    res.status(401).json({ error: 'User not found' });
    return;
  }
  if (user.role !== 'psychiatrist') {
    res.status(403).json({ error: 'Psychiatrist access only' });
    return;
  }
  const vs = user.verification_status;
  if (user.is_approved === true || vs === 'approved') {
    next();
    return;
  }
  if (vs === 'rejected') {
    res.status(403).json({ error: 'Psychiatrist verification rejected' });
    return;
  }
  if (vs === 'suspended') {
    res.status(403).json({ error: 'Account suspended' });
    return;
  }
  res.status(403).json({ error: 'Psychiatrist verification pending' });
};

/**
 * After `requireAuth`. Psychiatrist role from DB; allows **pending** verification so the
 * provider dashboard works before approval. Still blocks rejected/suspended and non-psychiatrists.
 * Public booking continues to require approved providers in appointment/counselor logic.
 */
export const requirePsychiatristAccess: RequestHandler = async (req, res, next) => {
  const a = req.auth;
  if (!a) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const user = await User.findById(a.id).select('role verification_status is_approved').lean();
  if (!user) {
    res.status(401).json({ error: 'User not found' });
    return;
  }
  if (user.role !== 'psychiatrist') {
    res.status(403).json({ error: 'Psychiatrist access only' });
    return;
  }
  const vs = user.verification_status;
  if (vs === 'rejected') {
    res.status(403).json({ error: 'Psychiatrist verification rejected' });
    return;
  }
  if (vs === 'suspended') {
    res.status(403).json({ error: 'Account suspended' });
    return;
  }
  next();
};
