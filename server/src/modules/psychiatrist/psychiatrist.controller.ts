import type { RequestHandler } from 'express';
import {
  getPsychiatristVerificationStatus,
  submitPsychiatristProfile,
  uploadPsychiatristDocument,
} from './psychiatrist.service.js';
import { AppError } from '../../utils/AppError.js';

export const getVerificationStatus: RequestHandler = async (req, res, next) => {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const status = await getPsychiatristVerificationStatus(req.userId);
    res.json(status);
  } catch (err) {
    next(err);
  }
};

export const getFullProfile: RequestHandler = async (req, res, next) => {
  try {
    if (!req.userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const status = await getPsychiatristVerificationStatus(req.userId);
    res.json(status);
  } catch (err) { next(err); }
};
export const submitVerification: RequestHandler = async (req, res, next) => {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const status = await submitPsychiatristProfile(req.userId, req.body);
    res.json(status);
  } catch (err) {
    next(err);
  }
};

export const uploadDocument: RequestHandler = async (req, res, next) => {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const file = req.file;
    if (!file) {
      throw new AppError(400, 'Document file is required');
    }
    const documentType = (req.body.document_type ?? 'other') as
      | 'license'
      | 'national_id'
      | 'certificate'
      | 'other';
    const doc = await uploadPsychiatristDocument(req.userId, file, documentType);
    res.status(201).json({ document: doc });
  } catch (err) {
    next(err);
  }
};
