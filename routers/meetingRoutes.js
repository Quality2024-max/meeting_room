import express from 'express';
import wrap from '../middlewares/asyncMiddleware.js';
import {requireAuth} from '../middlewares/authMiddleware.js'
import {getDashboard} from '../controllers/meetingController.js';


const router = express.Router();
router.use(requireAuth);


router.get('/dashboard', wrap(getDashboard));

export default router;