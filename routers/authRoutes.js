import express from 'express';
import { showLogin, showRegister, postRegister, postLogin, logout } from '../controllers/authController.js';
import wrap from '../middlewares/asyncMiddleware.js';



const router = express.Router();

router.get('/login', showLogin);
router.get('/register', showRegister);
router.post('/register', wrap(postRegister));
router.post('/login', wrap(postLogin));
router.post('/logout', logout);


export default router;