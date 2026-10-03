import express from 'express';
import { showLogin, showRegister, postRegister, postLogin } from '../controllers/authController.js';
import wrap from '../middlewares/asyncMiddleware.js';
import * as auth from '../controllers/authController.js';


const router = express.Router();

router.get('/login', auth.showLogin);
router.get('/register', auth.showRegister);
router.post('/register', wrap(auth.postRegister));
router.post('/login', wrap(auth.postLogin));
router.post('/logout', auth.logout);


export default router;