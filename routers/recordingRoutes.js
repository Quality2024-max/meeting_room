import express from "express";
import wrap from "../middlewares/asyncMiddleware.js";
import { requireAuth } from "../middlewares/authMiddleware.js";
import { upload, show, remove } from "../controllers/recordingController.js";

const router = express.Router();
router.use(requireAuth);

router.post("/meetings/:id/recording", wrap(upload));
router.get("/recordings/:id", wrap(show));
router.post("/recordings/:id/delete", wrap(remove));
export default router;
