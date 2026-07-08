import { Request, Response, NextFunction } from 'express';
import * as authService from '../services/authService';

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const { username, password } = req.body;
    const ip = req.ip || req.socket.remoteAddress;
    const result = authService.login(username, password, ip);
    res.json(result);
  } catch (err) { next(err); }
}

export async function refreshToken(req: Request, res: Response, next: NextFunction) {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) { res.status(400).json({ error: 'Refresh token is required' }); return; }
    const result = authService.refreshAccessToken(refreshToken);
    res.json(result);
  } catch (err) { next(err); }
}

export async function logout(req: Request, res: Response, next: NextFunction) {
  try {
    authService.logout(req.user!.id);
    res.json({ message: 'Logged out successfully' });
  } catch (err) { next(err); }
}

export async function getProfile(req: Request, res: Response, next: NextFunction) {
  try {
    const user = authService.getProfile(req.user!.id);
    res.json(user);
  } catch (err) { next(err); }
}

export async function updateProfile(req: Request, res: Response, next: NextFunction) {
  try {
    const user = authService.updateProfile(req.user!.id, req.body);
    res.json(user);
  } catch (err) { next(err); }
}

export async function changePassword(req: Request, res: Response, next: NextFunction) {
  try {
    const { current_password, new_password } = req.body;
    await authService.changePassword(req.user!.id, current_password, new_password);
    res.json({ message: 'Password changed successfully' });
  } catch (err) { next(err); }
}

export async function listUsers(_req: Request, res: Response, next: NextFunction) {
  try {
    const users = authService.listUsers();
    res.json(users);
  } catch (err) { next(err); }
}

export async function createUser(req: Request, res: Response, next: NextFunction) {
  try {
    const user = authService.createUser(req.body);
    res.status(201).json(user);
  } catch (err) { next(err); }
}

export async function updateUser(req: Request, res: Response, next: NextFunction) {
  try {
    await authService.updateUser(Number(req.params.id), req.body);
    res.json({ message: 'User updated successfully' });
  } catch (err) { next(err); }
}

export async function deleteUser(req: Request, res: Response, next: NextFunction) {
  try {
    await authService.deleteUser(Number(req.params.id));
    res.json({ message: 'User deleted successfully' });
  } catch (err) { next(err); }
}
