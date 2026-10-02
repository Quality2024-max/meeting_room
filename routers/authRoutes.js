import express from 'express';
import { showLogin, showRegister, postRegister } from '../controllers/authController.js';


const router = express.Router();

router.get('/login', showLogin);
router.get('/register', showRegister);
router.post('/register', postRegister);



export default router;