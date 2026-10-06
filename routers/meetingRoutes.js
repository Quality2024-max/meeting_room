import express from "express";
import wrap from "../middlewares/asyncMiddleware.js";
import { requireAuth } from "../middlewares/authMiddleware.js";
import {
  getDashboard,
  newForm,
  create,
  remove,
  join,
  room,
  end,
  feedback,
  showGuestJoin,
  guestJoin,
  invite,
} from "../controllers/meetingController.js";

const router = express.Router();
router.get("/join/:code", wrap(showGuestJoin));
router.post("/join/:code", wrap(guestJoin));

router.get("/room/:code", wrap(room));

router.use(requireAuth);

router.get("/dashboard", wrap(getDashboard));
router.get("/meetings/new", newForm);
router.post("/meetings", create);
router.post("/join", join);
router.post("meetings/:id/invite", wrap(invite));
router.post("/meetings/:id/end", wrap(end));
router.post("/meetings/:id/feedback", wrap(feedback));
router.post("/meetings/:id/delete", wrap(remove));

export default router;
