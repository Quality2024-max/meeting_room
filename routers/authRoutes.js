import express from 'express';
import { showLogin, showRegister } from '../controllers/authController.js';


const router = express.Router();

router.get('/login', showLogin);
router.get('/register', showRegister);



export default router;