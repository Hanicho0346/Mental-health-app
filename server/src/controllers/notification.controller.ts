import type { RequestHandler } from 'express';
import mongoose from 'mongoose';
import { Notification } from '../models/Notification.js';
import { logServerError } from '../utils/logger.js';

export const getNotifications: RequestHandler = async (req, res) => {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const notifications = await Notification.find({ recipient_id: req.userId })
      .sort({ created_at: -1 })
      .limit(50)
      .lean();

    const unreadCount = await Notification.countDocuments({
      recipient_id: req.userId,
      is_read: false,
    });

    res.json({
      notifications: notifications.map((n) => ({
        id: n._id.toString(),
        type: n.type,
        title: n.title,
        body: n.body,
        is_read: n.is_read,
        created_at: n.created_at,
        data: n.data,
      })),
      unread_count: unreadCount,
    });
  } catch (err) {
    logServerError('getNotifications', err);
    res.status(500).json({ error: 'Failed to load notifications' });
  }
};

export const markAsRead: RequestHandler = async (req, res) => {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ error: 'Invalid notification id' });
      return;
    }

    await Notification.findOneAndUpdate(
      { _id: id, recipient_id: req.userId },
      { is_read: true }
    );

    res.json({ ok: true });
  } catch (err) {
    logServerError('markAsRead', err);
    res.status(500).json({ error: 'Failed to mark notification read' });
  }
};

export const markAllAsRead: RequestHandler = async (req, res) => {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    await Notification.updateMany(
      { recipient_id: req.userId, is_read: false },
      { is_read: true }
    );

    res.json({ ok: true });
  } catch (err) {
    logServerError('markAllAsRead', err);
    res.status(500).json({ error: 'Failed to mark notifications read' });
  }
};

export const getUnreadCount: RequestHandler = async (req, res) => {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const count = await Notification.countDocuments({
      recipient_id: req.userId,
      is_read: false,
    });

    res.json({ unread_count: count });
  } catch (err) {
    logServerError('getUnreadCount', err);
    res.status(500).json({ error: 'Failed to get unread count' });
  }
};