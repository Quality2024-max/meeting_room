import express from 'express';
import { showLogin } from '../controllers/authController.js';


const router = express.Router();

router.get('/login', showLogin);



export default router;