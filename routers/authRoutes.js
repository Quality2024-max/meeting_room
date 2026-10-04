import express from 'express';
import wrap from '../middlewares/asyncMiddleware.js';
import { showLogin, showRegister, postRegister, postLogin, logout } from '../controllers/authController.js';




const router = express.Router();

router.get('/login', showLogin);
router.get('/register', showRegister);
router.post('/register', wrap(postRegister));
router.post('/login', wrap(postLogin));
router.post('/logout', logout);


export default router;