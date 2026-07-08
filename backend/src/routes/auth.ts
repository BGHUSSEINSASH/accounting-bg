import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { validate } from '../middleware/validate';
import * as authCtrl from '../controllers/authController';
import { loginSchema, createUserSchema, updateProfileSchema, changePasswordSchema, paginationSchema } from '../validators';

const router = Router();

router.post('/login', validate(loginSchema), authCtrl.login);
router.post('/refresh', authCtrl.refreshToken);
router.post('/logout', authenticate, authCtrl.logout);
router.get('/profile', authenticate, authCtrl.getProfile);
router.put('/profile', authenticate, validate(updateProfileSchema), authCtrl.updateProfile);
router.put('/password', authenticate, validate(changePasswordSchema), authCtrl.changePassword);

router.get('/users', authenticate, authorize('admin', 'manager'), authCtrl.listUsers);
router.post('/users', authenticate, authorize('admin', 'manager'), validate(createUserSchema), authCtrl.createUser);
router.put('/users/:id', authenticate, authorize('admin', 'manager'), authCtrl.updateUser);
router.delete('/users/:id', authenticate, authorize('admin'), authCtrl.deleteUser);

export default router;
