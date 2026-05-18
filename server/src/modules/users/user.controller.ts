import type { RequestHandler } from 'express';
import { logServerError } from '../../utils/logger.js';
import * as userService from './user.service.js';

export const getMe: RequestHandler = async (req, res, next) => {
  try {
    if (!req.userId || !req.auth) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    res.json(await userService.getMeProfile(req.userId));
  } catch (err) {
    logServerError('getMe', err, { userId: req.userId });
    next(err);
  }
};

export const getPeerPublic: RequestHandler = async (req, res, next) => {
  try {
    if (!req.userId || !req.auth) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    res.json(await userService.getPeerPublicProfile(req.params.peerId!, req.userId));
  } catch (err) {
    logServerError('getPeerPublic', err, { peerId: req.params.peerId, userId: req.userId });
    next(err);
  }
};

export const patchMe: RequestHandler = async (req, res, next) => {
  try {
    if (!req.userId || !req.auth) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    res.json(await userService.patchMeProfile(req.userId, req.body as Record<string, unknown>));
  } catch (err) {
    logServerError('patchMe', err, { userId: req.userId });
    next(err);
  }
};
