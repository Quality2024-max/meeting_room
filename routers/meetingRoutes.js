import express from 'express';
import wrap from '../middlewares/asyncMiddleware.js';
import {requireAuth} from '../middlewares/authMiddleware.js'
import {getDashboard, newForm, create, remove} from '../controllers/meetingController.js';


const router = express.Router();
router.use(requireAuth);


router.get('/dashboard', wrap(getDashboard));
router.get('/meetings/new', newForm);
router.post('/meetings', create);
router.post('/meetings/:id/delete', wrap(remove));

export default router;